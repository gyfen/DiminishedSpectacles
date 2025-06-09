/*
Tracklet controller
*/

/* Inputs */
// @input Component.ScriptComponent mlController
const mlController = script.mlController;

// @ui {"widget" : "separator"}
// @input SceneObject cameraObject
const cameraObject = script.cameraObject;

const camera = cameraObject.getComponent("Component.Camera");
const deviceTracking = cameraObject.getComponent("Component.DeviceTracking");

// @ui {"widget" : "separator"}
// @input Asset.ObjectPrefab trackletPrefab
const trackletPrefab = script.trackletPrefab;

// @ui {"widget" : "separator"}
// @input bool debugLocally
const debugLocally = script.debugLocally;

// Additional scaling factor applied to the scaling formula.
const depthScalingCorrection = 0.85;

// Define camera left and right
let deviceCameraLeft;
let deviceCameraRight;
let deviceCameraResolution;
let deviceCameraFocalLength;

// Register ML callback
mlController.onDetectionsUpdatedLeft = onDetectionsUpdatedLeft;
mlController.onDetectionsUpdatedRight = onDetectionsUpdatedRight;

// Object to keep track of all detection instances

let detectionGroups = [];
// const tracklets = {};
let trackletPool = [];

function avgAdd(avg, count, val) {
    return (avg * count + val) / (count - 1);
}

function avgRemove(avg, count, val) {
    return (avg * count - val) / (count + 1);
}

function deviceCameraScreenSpaceToWorldSpace(deviceCamera, xNorm, yNorm, absoluteDepth) {
    const cameraWorldTransform = cameraObject.getTransform().getWorldTransform();

    return cameraWorldTransform.multiplyPoint(
        deviceCamera.unproject(new vec2(xNorm, yNorm), absoluteDepth)
    );
}

/* Convert world space point to camera space point */
function worldSpaceToCameraSpace(point) {
    const cameraWorldTransform = cameraObject.getTransform().getWorldTransform();

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
function updateTracklet(tracklet, position, normal, dimensions, label, nutriScore) {
    tracklet.enabled = true;

    // Instantiate the object we want to place
    const trackletScript = tracklet.getComponent("Component.ScriptComponent");

    // calc rotation
    // TODO: they should all have the same normal
    // Rotate the object based on World Mesh Surface
    const up = vec3.up();
    const forwardDir = up.projectOnPlane(normal);
    const rot = quat.lookAt(forwardDir, normal);

    // compute the camera space depth from the world space point
    const depth = worldSpaceToCameraSpace(position).z;

    const [width, height] = dimensions;
    const absoluteWidth = normWidthToAbsolute(width, depth);
    const absoluteHeight = normHeightToAbsolute(height, depth);

    // Update the tracklet data
    trackletScript.setData(label, nutriScore);
    trackletScript.setTransform(point, rot, absoluteWidth, absoluteHeight);
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
        allLabels: [label],
        allLabelCounts: { [label]: 1 },
        allPositions: [position],
        allNormals: [normal],
        allDimensions: [dimensions],
        groupLabel: label,
        groupLabelCount: 1,
        groupPosition: position,
        groupNormal: normal,
        groupDimensions: dimensions,
        updated: true,
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

    group.groupPosition = new vec3(
        avgAdd(group.groupPosition.x, len, position),
        avgAdd(group.groupPosition.y, len, position),
        avgAdd(group.groupPosition.z, len, position)
    );

    group.groupNormal = new vec3(
        avgAdd(group.groupNormal.x, len, normal),
        avgAdd(group.groupNormal.y, len, normal),
        avgAdd(group.groupNormal.z, len, normal)
    );

    group.groupDimensions = new vec2(
        avgAdd(group.groupDimensions.x, len, dimensions.x),
        avgAdd(group.groupDimensions.y, len, dimensions.y)
    );

    group.allLabelsCounts[label] = group.allLabelsCounts[label]
        ? group.allLabelsCounts[label] + 1
        : 1;
    const [maxLabelCount, maxLabel] = maxCount(group.allLabelCounts);
    group.groupLabel = maxLabel;
    group.groupLabelCount = maxLabelCount;

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

    group.groupPosition = new vec3(
        avgRemove(group.groupPosition.x, len, position),
        avgRemove(group.groupPosition.y, len, position),
        avgRemove(group.groupPosition.z, len, position)
    );

    group.groupNormal = new vec3(
        avgRemove(group.groupNormal.x, len, normal),
        avgRemove(group.groupNormal.y, len, normal),
        avgRemove(group.groupNormal.z, len, normal)
    );

    group.groupDimensions = new vec2(
        avgRemove(group.groupDimensions.x, len, dimensions.x),
        avgRemove(group.groupDimensions.y, len, dimensions.y)
    );

    if (group.allLabelsCounts[label] === 1) {
        delete group.allLabelsCounts[label];
    } else {
        group.allLabelsCounts[label]--;
    }

    const [maxLabelCount, maxLabel] = maxCount(group.allLabelCounts);
    group.groupLabel = maxLabel;
    group.groupLabelCount = maxLabelCount;

    group.length--;
}

/* Remove the entire group */
function deleteDetectionGroup(index) {
    // remove from detectionGroups
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

    // if group wasnt updated or if group is full, delete the oldest entry
    // TODO: remove hardcode
    if (!group.updated || group.length > 10) {
        removeOldFromDetectionGroup(group, index);
    }

    // reset update status
    group.updated = false;

    // check if tracklet is to be enabled.:
    // count all labels, and if the max label count is > treshold (50% of window?)

    // if enough detections with the same label, assign it a tracklet
    // TODO: treshold not hardcoded
    if (group.groupLabelCount >= 0.7 * 10) {
        if (!group.tracklet) {
            group.tracklet = requestTracklet();
        }

        updateTracklet(
            group.tracklet,
            group.position,
            group.normal,
            group.dimensions,
            group.label
        );
    }
    // remove that tracklet, if applicable
    else if (group.tracklet) {
        // group.tracklet.enabled = false;
        retireTracklet(group.tracklet);
        group.tracklet = null;
    }
}

function parseDetections(detections, isLeft) {
    const deviceCamera = isLeft ? deviceCameraLeft : deviceCameraRight;

    // try to add every detection to a group
    detections: for (const detection of detections) {
        // Hittest
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

        const results = deviceTracking.raycastWorldMesh(rayStart, rayEnd);
        if (results.length === 0) {
            return false;
        }

        const position = results[0].position;
        const normal = results[0].normal;

        // Try to add to group
        for (const group of detectionGroups) {
            // TODO: remove hardcoded distance threshold
            // if close to group, add it
            if (position.distance(group.groupPosition) < 10) {
                addToDetectionGroup(
                    group,
                    detection.label,
                    position,
                    normal,
                    new vec2(detection.bbox[0], detection.bbox[1])
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
            new vec2(detection.bbox[0], detection.bbox[1])
        );
    }

    for (let i = 0; i < detectionGroups.length; i++) {
        // const group = detectionGroups[index];
        updateDetectionGroup(index);
    }
}

/* Gets triggered by MLController when detection results are in */
function onDetectionsUpdatedLeft(detectionsLeft) {
    parseDetections(detectionsLeft, true);
}

function onDetectionsUpdatedRight(detectionsRight) {
    parseDetections(detectionsRight, false);
}

/* --- Public API --- */

/* Update the material of all instances */
function updateTrackletsMaterial() {
    for (const [label, tracklet] of Object.entries(tracklets)) {
        if (tracklet.enabled) {
            const trackletScript = tracklet.getComponent("Component.ScriptComponent");
            trackletScript.updateAppearance();
        }
    }
}

function onStart() {
    deviceCameraLeft = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Left_Color
    );

    deviceCameraRight = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Right_Color
    );

    deviceCameraResolution = deviceCameraLeft.resolution;
    // average the focal lengths, since they differ.
    // TODO: this is mayble logical, since we merge results.
    deviceCameraFocalLength = deviceCameraLeft.focalLength.moveTowards(
        deviceCameraRight.focalLength,
        0.5
    );
}

script.createEvent("OnStartEvent").bind(onStart);

script.runOnce = mlController.runOnce;
script.startContinuous = mlController.startContinuous;
script.stopContinuous = mlController.stopContinuous;

script.updateTrackletsMaterial = updateTrackletsMaterial;
