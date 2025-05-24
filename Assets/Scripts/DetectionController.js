/*
Instance Controller
*/

/* Inputs */
// @input Component.ScriptComponent mlController

// @ui {"widget" : "separator"}
// @input Component.DeviceTracking deviceTracking

// @ui {"widget" : "separator"}
// @input Asset.ObjectPrefab prefab

// @ui {"widget" : "separator"}
// @input float screenScalingX = 1.0
// @input float screenScalingY = 1.0

let cameraLeft;
let cameraRight;

// Register callback
script.mlController.onDetectionsUpdated.add(onDetectionsUpdated);

if (!script.debug) {
    cameraModule = require("LensStudio:CameraModule");
    imageRequest = CameraModule.createImageRequest();
}

/* Averages two bounding boxes and returns the result */
// function mergeBboxes(bbox1, bbox2) {
//     let mergedBbox = [];

//     for (let i = 0; i < bbox1.length; i++) {
//         mergedBbox.push((bbox1[i] + bbox2[i]) / 2);
//     }

//     return mergedBbox;
// }

function averageVec3(v1, v2) {
    return new vec3((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2);
}

/* Merge two detection results into one better result */
function parseDetections(detectionsLeft, detectionsRight) {
    const mergedDetections = [];

    // Create a set of all labels without duplicates
    const labels1 = Object.keys(detectionsLeft);
    const labels2 = Object.keys(detectionsRight);
    const allLabels = new Set([...labels1, ...labels2]);

    for (const label of allLabels) {
        // if both labels exist
        const detectionLeft = detectionsLeft[label];
        const detectionRight = detectionsRight[label];

        if (detectionLeft && detectionRight) {
            const depth = 1000; // TODO: make this better

            const parsedDetection = {
                rayStart: averageVec3(
                    cameraLeft.unproject(
                        new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]),
                        0
                    ),
                    cameraLeft.unproject(new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]), 0)
                ),
                rayEnd: averageVec3(
                    cameraLeft.unproject(
                        new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]),
                        depth
                    ),
                    cameraLeft.unproject(
                        new vec2(detectionLeft.bbox[0], detectionLeft.bbox[1]),
                        depth
                    )
                ),
                width: (detectionLeft.bbox[2] + detectionRight.bbox[2]) / 2,
                height: (detectionLeft.bbox[3] + detectionRight.bbox[3]) / 2,
                label: label,
                nutriScore: detectionLeft.nutriScore,
            };

            mergedDetections.push(parsedDetection);
        }
    }

    return mergedDetections;
}

/* Spawn an instance */
function spawnInstance(rayStart, rayEnd, width, height, label, nutriScore) {
    const results = script.deviceTracking.raycastWorldMesh(rayStart, rayEnd);

    if (results.length == 0) {
        return false;
    }

    // Get World Mesh data at the screen position
    const point = results[0].position;
    const normal = results[0].normal;

    // Instantiate the object we want to place
    const instance = script.prefab.instantiate(script.getSceneObject());
    const instanceScript = instance.getComponent("Component.ScriptComponent");

    // Update the instance data
    instanceScript.nutriScore = nutriScore;
    instanceScript.updateMaterial();

    // TODO: they should all have to same normal
    // Rotate the object based on World Mesh Surface
    const up = vec3.up();
    const forwardDir = up.projectOnPlane(normal);
    const rot = quat.lookAt(forwardDir, normal);
    instance.getTransform().setWorldRotation(rot);

    // Set position
    instance.getTransform().setWorldPosition(point);

    return true;
}

/* Spawn all instances */
function spawnInstances(parsedDetections) {
    for (let i = 0; i < parseDetections.length; i++) {
        const { rayStart, rayEnd, width, height, label, nutriScore } = parsedDetections[i];
        // TODO: make this better
        spawnInstance(rayStart, rayEnd, width, height, label, nutriScore);
    }
}

/* Gets triggered by MLController when detection results are in */
function onDetectionsUpdated(detectionsLeft, detectionsRight) {
    // Delete all existing instances
    // TODO: instead of delete, move the object if its exists already.
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        instance.destroy();
    }

    const parsedDetections = parseDetections(detectionsLeft, detectionsRight);

    spawnInstances(parsedDetections);
}

/* --- Public API --- */

/* Detect objects and spawn instances */
function calibrate() {
    script.mlController.runOnce();
}

/* Update the material of all instances */
function updateInstances() {
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        const instanceScript = instance.getComponent("Component.ScriptComponent");
        instanceScript.updateMaterial();
    }
}

function onStart() {
    cameraLeft = global.deviceInfoSystem.getTrackingCameraForId(CameraModule.CameraId.Left_Color);
    cameraRight = global.deviceInfoSystem.getTrackingCameraForId(
        CameraModule.CameraId.Right_Color
    );
}

script.createEvent("OnStartEvent").bind(onStart);

script.calibrate = calibrate;
script.updateInstances = updateInstances;
