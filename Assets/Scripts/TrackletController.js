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

function avgAdd(avg, num) {}

function avgRemove(avg, num) {}

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
function updateTracklet(tracklet, position, normal, width, height, label, nutriScore) {
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

/* update all tracklets using new detections */
// function updateTracklets(parsedDetections) {
// for (const label of mergedLabels) {
//     // if this label has a detection: enable and update it
//     if (parsedDetections[label] !== undefined) {
//         const { rayStart, rayEnd, width, height, nutriScore } = parsedDetections[label];
//         updateTracklet(rayStart, rayEnd, width, height, label, nutriScore);
//     }
//     // if this label is not detected: disable
//     else {
//         disableTracklet(label);
//     }
// }
// }

function newDetectionGroup(label, position, normal, dimensions) {
    const group = {
        length: 1,
        tracklet: null,
        allLabels: [label],
        allPositions: [position],
        allNormals: [normal],
        allDimensions: [dimensions],
        groupLabel: label,
        groupPosition: position,
        groupNormal: normal,
        groupDimensions: dimensions,
        updated: true,
    };

    detectionGroups.push(group);
}

function addToDetectionGroup(group, label, position, normal, dimensions) {
    group.updated = true;
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

    // if group wasnt updated and only one left, remove it
    if (!group.updated && group.length === 1) {
        deleteDetectionGroup(index);
    }
    // if group wasnt updated or if group is full, delete the oldest entry
    // TODO: remove hardcode
    else if (!group.updated || group.length > 10) {
        // remove old

        // reset update status
        group.updated = false;
    }

    // check if tracklet is to be enabled.:
    // count all labels, and if the max label count is > treshold (50% of window?)
    let maxLabel;
    let maxLabelCount = 0;

    // count the labels
    const counts = {};
    for (const label of group.allLabels) {
        const count = counts[label] ? counts[label] + 1 : 1;
        counts[label] = count;

        if (count > maxLabelCount) {
            maxLabelCount = count;
            maxLabel = label;
        }
    }

    // if enough detections with the same label, assign it a tracklet
    // TODO: treshold not hardcoded
    if (maxLabelCount > 0.7 * 10) {
        if (!group.tracklet) {
            group.tracklet = requestTracklet();
        }

        updateTracklet(group.tracklet);
    }
    // remove that tracklet, if applicable
    else if (group.tracklet) {
        // group.tracklet.enabled = false;
        retireTracklet(group.tracklet);
        group.tracklet = null;
    }

    // group.tracklet.enabled = true;
    // else group.tracklet.enabled = false
}

function parseDetections(detections, isLeft) {
    const deviceCamera = isLeft ? deviceCameraLeft : deviceCameraRight;

    let updatedGroups = [];

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
        for (const [index, group] of detectionGroups.entries()) {
            // TODO: remove hardcoded distance threshold
            // if close to group, add it
            if (position.distance(group.groupPosition) < 10) {
                addToDetectionGroup(group, detection.label, position, normal, [
                    detection.bbox[0],
                    detection.bbox[0],
                ]);

                // stop parsing this detection
                continue detections;
            }
        }

        // if not added to any group, make a new group
        newDetectionGroup(detection.label, position, normal, [
            detection.bbox[0],
            detection.bbox[0],
        ]);
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
