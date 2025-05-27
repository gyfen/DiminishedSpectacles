/*
Instance Controller
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

// Define camera left and right
let deviceCameraLeft;
let deviceCameraRight;
let deviceCameraResolution;
let deviceCameraFocalLength;

// Register ML callback
mlController.onDetectionsUpdated.add(onDetectionsUpdated);

// Object to keep track of all detection instances
const tracklets = {};

function averageVec3(v1, v2) {
    return new vec3((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2);
}

function mergeDetectionLabels(d1, d2) {
    return new Set([...Object.keys(d1), ...Object.keys(d2)]);
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
    return ((width * deviceCameraResolution.x) / deviceCameraFocalLength.x) * depth;
}

/* Convert normalized height to absolute height in cm */
function normHeightToAbsolute(height, depth) {
    return ((height * deviceCameraResolution.y) / deviceCameraFocalLength.y) * depth;
}

/** Merge two detection results into one better result
 * returns {label: {rayStart, rayEnd, width, height}}
 * @returns {string: {vec2, vec2, float, float, int}}
 */
function parseDetections(detectionsLeft, detectionsRight) {
    const parsedDetections = {};

    const allLabels = mergeDetectionLabels(detectionsLeft, detectionsRight);

    for (const label of allLabels) {
        const detectionLeft = detectionsLeft[label];
        let detectionRight = detectionsRight[label];

        // Debug: only use left camera
        if (debugLocally) {
            detectionRight = detectionLeft;
        }

        // If left and right dont have the same label, skip it.
        if (detectionLeft === undefined || detectionRight === undefined) {
            continue;
        }

        const parsedDetection = {
            rayStart: averageVec3(
                deviceCameraScreenSpaceToWorldSpace(
                    deviceCameraLeft,
                    detectionLeft.bbox[0],
                    detectionLeft.bbox[1],
                    camera.near
                ),
                deviceCameraScreenSpaceToWorldSpace(
                    deviceCameraRight,
                    detectionRight.bbox[0],
                    detectionRight.bbox[1],
                    camera.near
                )
            ),
            rayEnd: averageVec3(
                deviceCameraScreenSpaceToWorldSpace(
                    deviceCameraLeft,
                    detectionLeft.bbox[0],
                    detectionLeft.bbox[1],
                    camera.far
                ),
                deviceCameraScreenSpaceToWorldSpace(
                    deviceCameraRight,
                    detectionRight.bbox[0],
                    detectionRight.bbox[1],
                    camera.far
                )
            ),
            width: (detectionLeft.bbox[2] + detectionRight.bbox[2]) / 2,
            height: (detectionLeft.bbox[3] + detectionRight.bbox[3]) / 2,
            nutriScore: detectionLeft.nutriScore,
        };

        parsedDetections[label] = parsedDetection;
    }

    return parsedDetections;
}

/* gets an tracklet for a label. if the tracklet doesnt exist, spawn one */
function getTracklet(label) {
    // attempt to get from storage
    let tracklet = tracklets[label];

    // otherwise create a new one
    if (!tracklet) {
        tracklet = trackletPrefab.instantiate(script.getSceneObject());
        tracklets[label] = tracklet;
    }

    return tracklet;
}

function disableTracklet(label) {
    tracklets[label].enabled = false;
}

/* update a tracklet */
function updateTracklet(rayStart, rayEnd, width, height, label, nutriScore) {
    const results = deviceTracking.raycastWorldMesh(rayStart, rayEnd);

    if (results.length === 0) {
        return false;
    }

    // get the tracklet
    const tracklet = getTracklet(label);
    tracklet.enabled = true;

    // Instantiate the object we want to place
    const trackletScript = tracklet.getComponent("Component.ScriptComponent");

    // Get World Mesh data at the screen position
    const point = results[0].position;
    const normal = results[0].normal;

    // calc rotation
    // TODO: they should all have the same normal
    // Rotate the object based on World Mesh Surface
    const up = vec3.up();
    const forwardDir = up.projectOnPlane(normal);
    const rot = quat.lookAt(forwardDir, normal);

    // compute the camera space depth from the world space point
    const depth = worldSpaceToCameraSpace(point).z;
    const absoluteWidth = normWidthToAbsolute(width, depth);
    const absoluteHeight = normHeightToAbsolute(height, depth);

    // Update the tracklet data
    trackletScript.setData(label, nutriScore);
    trackletScript.setTransform(point, rot, absoluteWidth, absoluteHeight);
    trackletScript.updateMaterial();

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

    // update the tracklets with the new detections
    updateTracklets(parsedDetections);
}

/* --- Public API --- */

/* Detect objects and spawn instances */
function calibrate() {
    mlController.runOnce();
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
    deviceCameraLeft = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Left_Color
    );
    // For debugging on other platforms, set the right camera to be the same as the left

    deviceCameraRight = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Right_Color
    );

    deviceCameraResolution = deviceCameraLeft.resolution;
    deviceCameraFocalLength = deviceCameraLeft.focalLength.moveTowards(
        deviceCameraRight.focalLength,
        0.5
    );
}

script.createEvent("OnStartEvent").bind(onStart);

script.calibrate = calibrate;
script.updateTrackletsMaterial = updateTrackletsMaterial;
