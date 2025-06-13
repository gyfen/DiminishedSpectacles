/*
Tracklet controller
*/

const store = global.persistentStorageSystem.store;

/* Inputs */
// @input Component.ScriptComponent mlController
const mlController = script.mlController;

//@ui {"widget":"group_start", "label":"Links"}
// @input SceneObject cameraObject
const cameraObject = script.cameraObject;

const camera = cameraObject.getComponent("Component.Camera");
const deviceTracking = cameraObject.getComponent("Component.DeviceTracking");

// @input Asset.ObjectPrefab trackletPrefab
const trackletPrefab = script.trackletPrefab;
//@ui {"widget":"group_end"}

// @ui {"widget" : "separator"}
//@ui {"widget":"group_start", "label":"Detection settings"}
// @input int detectionWindow = 4 {"widget" : "slider", "min" : 1, "max" : 50, "step" : 1}

let detectionWindow = script.detectionWindow;

// @input float consensusFraction = 0.5 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.05}
const consensusFraction = script.consensusFraction;

// @input int groupingDistance = 10 {"widget" : "slider", "min" : 0, "max" : 30, "step" : 1}
const groupingDistance = script.groupingDistance;
//@ui {"widget":"group_end"}

// @ui {"widget" : "separator"}
// Additional scaling factor applied to the scaling formula.
// @input float depthScalingCorrection = 0.85 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.01}
const depthScalingCorrection = script.depthScalingCorrection;

// @ui {"widget" : "separator"}

let enableGrouping = store.getInt("enableGrouping");

// @input bool enableRightCamera = true {"showIf": "enableGrouping", "hint": "Use both the left and right camera to run inference. This might improve detection accuracy but decrease performance."}
let enableRightCamera = script.enableRightCamera && enableGrouping;

// Define camera left and right
let deviceCameraLeft;
let deviceCameraRight;
let deviceCameraResolution;
let deviceCameraFocalLength;

// Register ML callback
mlController.onDetectionsUpdated = onDetectionsUpdated;

// keep track of groups
let detectionGroups = [];
// available tracklets
let trackletPool = [];

// determines if old detections should be memorized or forgotten.
let enableMemory = store.getInt("enableMemory");

// set later
let cameraWorldTransform;

/* add a value to an existing average.
this should be more efficient than re-computing the total average
every time
*/
function avgAdd(avg, count, val) {
    return (avg * count + val) / (count + 1);
}

/* remove a value from an existing average. */
function avgRemove(avg, count, val) {
    return (avg * count - val) / (count - 1);
}

/* converts a coordinate from device camera screen space to world space */
function deviceCameraScreenSpaceToWorldSpace(deviceCamera, xNorm, yNorm, absoluteDepth) {
    return cameraWorldTransform.multiplyPoint(
        deviceCamera.unproject(new vec2(xNorm, yNorm), absoluteDepth)
    );
}

/* Convert world space point to camera space point */
function worldSpaceToCameraSpace(point) {
    return cameraWorldTransform.inverse().multiplyPoint(point);
}

/* Convert normalized width to absolute width in cm */
function normWidthToAbsolute(width, depth) {
    return (
        (width * deviceCameraResolution.x * depth * depthScalingCorrection) /
        deviceCameraFocalLength.x
    );
}

/* Convert normalized height to absolute height in cm */
function normHeightToAbsolute(height, depth) {
    return (
        (height * deviceCameraResolution.y * depth * depthScalingCorrection) /
        deviceCameraFocalLength.y
    );
}

/* update a tracklet */
function updateTracklet(tracklet, position, normal, dimensions, label, data) {
    tracklet.enabled = true;

    // Instantiate the object we want to place
    const trackletScript = tracklet.getComponent("Component.ScriptComponent");

    // calc rotation
    // TODO: they could all have the same normal, which might result in nicer results but more computation
    // Rotate the object based on World Mesh Surface
    const up = vec3.up();
    const forwardDir = up.projectOnPlane(normal);
    const rotation = quat.lookAt(forwardDir, normal);

    // compute the camera space depth from the world space point
    const depth = worldSpaceToCameraSpace(position).z;

    const absoluteWidth = normWidthToAbsolute(dimensions.x, depth);
    const absoluteHeight = normHeightToAbsolute(dimensions.y, depth);

    // Update the tracklet data
    trackletScript.setData(label, data);
    trackletScript.setTransform(position, rotation, absoluteWidth, absoluteHeight);
    trackletScript.updateAppearance();

    return true;
}

/* gets a new tracklet. if the pool is empty, spawn one */
function getTracklet() {
    // if no tracklets left
    if (trackletPool.length === 0) {
        return trackletPrefab.instantiate(script.getSceneObject());
    }

    return trackletPool.pop();
}

/* puts a tracklet back into the tracklet pool, and disables it */
function retireTracklet(tracklet) {
    tracklet.enabled = false;
    trackletPool.push(tracklet);
}

/* creates new group and adds it to registry */
function newDetectionGroup(label, position, normal, dimensions) {
    const group = {
        length: 1,
        tracklet: null,
        updated: true,
        label: label,
        labelCount: 1,
        position: position,
        normal: normal,
        dimensions: dimensions,
        // individual properties
        allLabels: [label],
        allLabelCounts: { [label]: 1 },
        allPositions: [position],
        allNormals: [normal],
        allDimensions: [dimensions],
    };

    detectionGroups.push(group);
}

function maxCount(obj) {
    let maxKeyCount = 0;
    let maxKey = null;

    for (const [key, count] of Object.entries(obj)) {
        if (count > maxKeyCount) {
            maxKeyCount = count;
            maxKey = key;
        }
    }

    return [maxKey, maxKeyCount];
}

function addToDetectionGroup(group, label, position, normal, dimensions) {
    group.updated = true;

    group.allLabels.push(label);
    group.allPositions.push(position);
    group.allNormals.push(normal);
    group.allDimensions.push(dimensions);

    const len = group.length;

    group.position = new vec3(
        avgAdd(group.position.x, len, position.x),
        avgAdd(group.position.y, len, position.y),
        avgAdd(group.position.z, len, position.z)
    );

    group.normal = new vec3(
        avgAdd(group.normal.x, len, normal.x),
        avgAdd(group.normal.y, len, normal.y),
        avgAdd(group.normal.z, len, normal.z)
    );

    group.dimensions = new vec2(
        avgAdd(group.dimensions.x, len, dimensions.x),
        avgAdd(group.dimensions.y, len, dimensions.y)
    );

    group.allLabelCounts[label] = group.allLabelCounts[label]
        ? group.allLabelCounts[label] + 1
        : 1;
    const [maxLabel, maxLabelCount] = maxCount(group.allLabelCounts);
    group.label = maxLabel;
    group.labelCount = maxLabelCount;

    group.length++;
}

function removeOldFromDetectionGroup(group, index) {
    if (group.length === 1) {
        deleteDetectionGroup(index);
        return;
    }

    const label = group.allLabels.shift();
    const position = group.allPositions.shift();
    const normal = group.allNormals.shift();
    const dimensions = group.allDimensions.shift();

    const len = group.length;

    group.position = new vec3(
        avgRemove(group.position.x, len, position.x),
        avgRemove(group.position.y, len, position.y),
        avgRemove(group.position.z, len, position.z)
    );

    group.normal = new vec3(
        avgRemove(group.normal.x, len, normal.x),
        avgRemove(group.normal.y, len, normal.y),
        avgRemove(group.normal.z, len, normal.z)
    );

    group.dimensions = new vec2(
        avgRemove(group.dimensions.x, len, dimensions.x),
        avgRemove(group.dimensions.y, len, dimensions.y)
    );

    if (group.allLabelCounts[label] === 1) {
        delete group.allLabelCounts[label];
    } else {
        group.allLabelCounts[label]--;
    }

    const [maxLabel, maxLabelCount] = maxCount(group.allLabelCounts);
    group.label = maxLabel;
    group.labelCount = maxLabelCount;

    group.length--;
}

/* Remove the entire group */
function deleteDetectionGroup(index) {
    detectionGroups.splice(index, 1);
}

/*
Update detection groups:
- Removes old detections
- Enables and disabled tracklets
- Deletes empty groups
*/
function updateDetectionGroup(index) {
    const group = detectionGroups[index];

    // if group wasnt updated, or if group is full, delete the oldest entry
    // if memorize, only delete if group has never surpassed the treshold
    if (
        ((enableMemory ? group.labelCount < consensusFraction * detectionWindow : true) &&
            !group.updated) ||
        group.length > detectionWindow
    ) {
        removeOldFromDetectionGroup(group, index);
    }

    // reset update status
    group.updated = false;

    // check if tracklet is to be enabled.:
    // count all labels, and if the max label count is > treshold * window
    // if enough detections with the same label, assign it a tracklet
    if (group.labelCount > consensusFraction * detectionWindow) {
        if (!group.tracklet) {
            group.tracklet = getTracklet();
        }

        updateTracklet(
            group.tracklet,
            group.position,
            group.normal,
            group.dimensions,
            group.label,
            mlController.getLabelData(group.label)
        );
    }
    // remove that tracklet, if applicable
    else if (group.tracklet) {
        retireTracklet(group.tracklet);
        group.tracklet = null;
    }
}

function parseDetectionsGrouping(detections, isLeft) {
    const deviceCamera = isLeft ? deviceCameraLeft : deviceCameraRight;

    // try to add every detection to a group
    detections: for (const detection of detections) {
        // world mesh Hittest
        const rayStart = deviceCameraScreenSpaceToWorldSpace(
            deviceCamera,
            detection.bbox[0],
            detection.bbox[1],
            camera.near
        );

        const rayEnd = deviceCameraScreenSpaceToWorldSpace(
            deviceCamera,
            detection.bbox[0],
            detection.bbox[1],
            camera.far
        );

        // world mesh hit test
        const results = deviceTracking.raycastWorldMesh(rayStart, rayEnd);
        if (results.length === 0) {
            continue;
        }

        const position = results[0].position;
        const normal = results[0].normal;

        // world query hit test; doesnt work
        // const WorldQueryModule = require("LensStudio:WorldQueryModule")
        // const hitTestSession = worldQueryModule.createHitTestSession();
        // hitTestSession.start();

        // function hitTestAsync(rayStart, rayEnd) {
        //     return new Promise((resolve, reject) => {
        //         hitTestSession.hitTest(rayStart, rayEnd, function (hit) {
        //             if (hit !== undefined) {
        //                 resolve(hit);
        //             } else {
        //                 reject(new Error("No hit detected"));
        //             }
        //         });
        //     });
        // }

        // const result = await hitTestAsync(rayStart, rayEnd);
        // print(result);

        // if (!result) {
        //     continue;
        // }

        // const position = result.position;
        // const normal = result.normal;

        // Try to add to group
        for (const group of detectionGroups) {
            // if close to group, add it
            if (position.distance(group.position) < groupingDistance) {
                addToDetectionGroup(
                    group,
                    detection.label,
                    position,
                    normal,
                    new vec2(detection.bbox[2], detection.bbox[3])
                );

                // stop parsing this detection
                continue detections;
            }
        }

        // if not added to any group, make a new group
        newDetectionGroup(
            detection.label,
            position,
            normal,
            new vec2(detection.bbox[2], detection.bbox[3])
        );
    }

    // update all groups, removing old entries and purging empty groups
    for (let i = 0; i < detectionGroups.length; i++) {
        updateDetectionGroup(i);
    }
}

// only used for normal detections, not for grouping algo
let activeTracklets = [];

function parseDetections(detections) {
    // reset all tracklets
    for (const tracklet of activeTracklets) {
        retireTracklet(tracklet);
    }

    for (const detection of detections) {
        // world mesh Hittest
        const rayStart = deviceCameraScreenSpaceToWorldSpace(
            deviceCameraLeft,
            detection.bbox[0],
            detection.bbox[1],
            camera.near
        );

        const rayEnd = deviceCameraScreenSpaceToWorldSpace(
            deviceCameraLeft,
            detection.bbox[0],
            detection.bbox[1],
            camera.far
        );

        // world mesh hit test
        const results = deviceTracking.raycastWorldMesh(rayStart, rayEnd);
        if (results.length === 0) {
            continue;
        }

        const position = results[0].position;
        const normal = results[0].normal;

        const tracklet = getTracklet();
        activeTracklets.push(tracklet);

        updateTracklet(
            tracklet,
            position,
            normal,
            new vec2(detection.bbox[2], detection.bbox[3]),
            detection.label,
            mlController.getLabelData(detection.label)
        );
    }
}

/* Gets triggered by MLController when detection results are in from either side */
function onDetectionsUpdated(transform, detections, isLeft) {
    cameraWorldTransform = transform;

    if (enableGrouping) {
        parseDetectionsGrouping(detections, isLeft);
    } else {
        parseDetections(detections);
    }
}

/* --- Public API --- */

/* Update the material of all instances */
function updateTrackletsMaterial() {
    if (enableGrouping) {
        for (const group of detectionGroups) {
            const tracklet = group.tracklet;
            if (!tracklet) {
                continue;
            }

            const trackletScript = tracklet.getComponent("Component.ScriptComponent");
            trackletScript.updateAppearance();
        }
    } else {
        for (const tracklet of activeTracklets) {
            const trackletScript = tracklet.getComponent("Component.ScriptComponent");
            trackletScript.updateAppearance();
        }
    }
}

function toggleDetectionMemory(enabled) {
    // enableMemory = store.getInt("enableMemory");
    enableMemory = enabled;

    // if memory is turned off, delete all groups.
    if (!enableMemory) {
        // retire tracklets
        retireTracklets();

        // reset the group list
        detectionGroups.length = 0;
    }
}

function toggleGrouping(enabled) {
    enableGrouping = enabled;
    mlController.toggleGrouping(enabled);

    enableRightCamera = script.enableRightCamera && enableGrouping;
    detectionGroups.length = 0;
    retireTracklets();
}

function retireTracklets() {
    if (enableGrouping) {
        for (let i = 0; i < detectionGroups.length; i++) {
            const group = detectionGroups[i];
            if (group.tracklet) {
                retireTracklet(group.tracklet);
            }
        }
    } else {
        for (const tracklet of activeTracklets) {
            retireTracklet(tracklet);
        }
    }
}

function onStart() {
    // Double the window if we use the right camera, because we run two inference at the same time.
    if (enableRightCamera) {
        detectionWindow *= 2;
    }

    deviceCameraLeft = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Left_Color
    );

    deviceCameraRight = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Right_Color
    );

    deviceCameraResolution = deviceCameraLeft.resolution;
    // average the focal lengths, since they differ.
    // TODO: this seems logical enough, since we merge results.
    deviceCameraFocalLength = deviceCameraLeft.focalLength.moveTowards(
        deviceCameraRight.focalLength,
        0.5
    );
}

function runOnce() {
    mlController.runOnce(enableRightCamera, detectionWindow);
}

function startContinuous() {
    mlController.startContinuous(enableRightCamera);
}

function stopContinuous() {
    mlController.stopContinuous();
}

script.createEvent("OnStartEvent").bind(onStart);

script.runOnce = runOnce;
script.startContinuous = startContinuous;
script.stopContinuous = stopContinuous;

script.toggleDetectionMemory = toggleDetectionMemory;
script.toggleGrouping = toggleGrouping;

script.updateTrackletsMaterial = updateTrackletsMaterial;
