/*
Instance Controller
*/

/* Inputs */
// @input Component.ScriptComponent mlController

// @ui {"widget" : "separator"}
// @input SceneObject cameraObj
// @input Component.DeviceTracking deviceTracking

// @ui {"widget" : "separator"}
// @input Asset.ObjectPrefab prefab

const maxDepth = 1000;

let cameraLeft;
let cameraRight;

// Register ML callback
script.mlController.onDetectionsUpdated.add(onDetectionsUpdated);

if (!script.debug) {
    cameraModule = require("LensStudio:CameraModule");
    imageRequest = CameraModule.createImageRequest();
}

// object to keep track of all detection instances
const tracklets = {};

function averageVec3(v1, v2) {
    return new vec3((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2);
}

/* Merge two detection results into one better result
returns {label: {rayStart, rayEnd, normWidth, normHeight}} */

function mergeDetectionLabels(d1, d2) {
    return new Set([...Object.keys(d1), ...Object.keys(d2)]);
}

/** @returns {string: {vec2, vec2, float, float, string, int}} */
function parseDetections(detectionsLeft, detectionsRight) {
    const mergedDetections = {};

    // Create a set of all labels without duplicates
    // const labels1 = Object.keys(detectionsLeft);
    // const labels2 = Object.keys(detectionsRight);
    // const allLabels = new Set([...labels1, ...labels2]);
    const allLabels = mergeDetectionLabels(detectionsLeft, detectionsRight);

    for (const label of allLabels) {
        // if both labels exist
        const detectionLeft = detectionsLeft[label];
        const detectionRight = detectionsRight[label];

        const trans = script.cameraObj.getTransform().getWorldTransform();
        // cameraLeft.pose.multiplyPoint

        if (detectionLeft && detectionRight) {
            const depth = maxDepth; // TODO: make this better

            const parsedDetection = {
                rayStart: averageVec3(
                    trans.multiplyPoint(
                        cameraLeft.unproject(
                            new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]),
                            0
                        )
                    ),
                    trans.multiplyPoint(
                        cameraRight.unproject(
                            new vec2(detectionRight.bbox[0], detectionRight.bbox[1]),
                            0
                        )
                    )
                ),
                rayEnd: averageVec3(
                    trans.multiplyPoint(
                        cameraLeft.unproject(
                            new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]),
                            depth
                        )
                    ),
                    trans.multiplyPoint(
                        cameraRight.unproject(
                            new vec2(detectionRight.bbox[0], detectionRight.bbox[1]),
                            depth
                        )
                    )
                ),
                width: (detectionLeft.bbox[2] + detectionRight.bbox[2]) / 2,
                height: (detectionLeft.bbox[3] + detectionRight.bbox[3]) / 2,
                // label: label,
                nutriScore: detectionLeft.nutriScore,
            };

            mergedDetections[label] = parsedDetection;
        }
    }

    return mergedDetections;
}

/* gets an tracklet for a label. if the tracklet doesnt exist, spawn one */
function getTracklet(label) {
    // appempt to get from storage
    let tracklet = tracklets[label];
    // otherwise create a new one
    if (!tracklet) {
        tracklet = script.prefab.instantiate(script.getSceneObject());
        tracklets[label] = tracklet;
    }

    return tracklet;
}

function disableTracklet(label) {
    tracklets[label].enabled = false;
}

/* Spawn a tracklet */
function updateTracklet(rayStart, rayEnd, width, height, label, nutriScore) {
    const results = script.deviceTracking.raycastWorldMesh(rayStart, rayEnd);

    if (results.length == 0) {
        return false;
    }

    // Get World Mesh data at the screen position
    const point = results[0].position;
    const normal = results[0].normal;

    // get instance
    const instance = getTracklet(label);

    // enable the instance
    instance.enabled = true;

    // Instantiate the object we want to place
    // const instance = script.prefab.instantiate(script.getSceneObject());
    const instanceScript = instance.getComponent("Component.ScriptComponent");

    // Update the instance data
    instanceScript.setData(label, nutriScore);
    instanceScript.updateMaterial();

    // TODO: they should all have the same normal
    // Rotate the object based on World Mesh Surface
    const up = vec3.up();
    const forwardDir = up.projectOnPlane(normal);
    const rot = quat.lookAt(forwardDir, normal);
    instance.getTransform().setWorldRotation(rot);

    // Set position
    instance.getTransform().setWorldPosition(point);

    // Register the instance
    // tracklets[label] = instance;

    return true;
}

/* update all tracklets using new detections */
function updateTracklets(parsedDetections) {
    // all relevant labels: the tracklet labels, and detection labels combined
    const mergedLabels = mergeDetectionLabels(tracklets, parsedDetections);

    for (const label of mergedLabels) {
        // if this label has a detection: enable and update it
        if (parsedDetections[label] !== undefined) {
            const { rayStart, rayEnd, width, height, nutriScore } = parsedDetections[label];
            updateTracklet(rayStart, rayEnd, width, height, label, nutriScore);
        }
        // if this label is not detected: disable
        else {
            disableTracklet(label);
        }
    }
}

/* Gets triggered by MLController when detection results are in */
function onDetectionsUpdated(detectionsLeft, detectionsRight) {
    // parse detections
    const parsedDetections = parseDetections(detectionsLeft, detectionsRight);

    print("detectoins");

    // update the tracklets with the new detections
    updateTracklets(parsedDetections);
}

/* --- Public API --- */

/* Detect objects and spawn instances */
function calibrate() {
    script.mlController.runOnce();
}

/* Update the material of all instances */
function updateTrackletsMaterial() {
    for (const [label, tracklet] of Object.entries(tracklets)) {
        if (tracklet.enabled) {
            const trackletScript = tracklet.getComponent("Component.ScriptComponent");
            trackletScript.updateMaterial();
        }
    }
}

function onStart() {
    // const labels = script.mlController.getLabels();

    // // spawn all detection instances
    // for (let i = 0; i < labels.length; i++) {}

    cameraLeft = global.deviceInfoSystem.getTrackingCameraForId(CameraModule.CameraId.Left_Color);
    cameraRight = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Right_Color
    );
}

script.createEvent("OnStartEvent").bind(onStart);

script.calibrate = calibrate;
script.updateTrackletsMaterial = updateTrackletsMaterial;
