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

// @ui {"widget" : "separator"}
// @input bool consensusRequired = true

// Register callback
script.mlController.onDetectionsUpdated.add(onDetectionsUpdated);

if (!script.debug) {
    cameraModule = require("LensStudio:CameraModule");
    imageRequest = CameraModule.createImageRequest();
    // TODO: crop img?
    // imageRequest.crop(Rect.create(-1, 1, -1, 1));
    // imageRequest.resolution(new vec2(1280, 1280));
}

/* Transform screenpoint to correcly fit to the spectacles screen */
function transformScreenPoint(screenPoint) {
    return new vec2(
        screenPoint.x * script.screenScalingX - (script.screenScalingX - 1) / 2,
        screenPoint.y * script.screenScalingY - (script.screenScalingY - 1) / 2
    );
}

/* Spawn an instance */
function spawnInstance(screenPos, label, confidence, nutriScore) {
    const results = script.deviceTracking.hitTestWorldMesh(screenPos);

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
function spawnInstances(detections) {
    for (const [label, data] of Object.entries(detections)) {
        const { confidence, bbox, nutriScore } = data;
        // TODO: make this better
        spawnInstance(
            transformScreenPoint(new vec2(bbox[0], bbox[1])),
            label,
            confidence,
            nutriScore
        );
    }
}

/* Averages two bounding boxes and returns the result */
function mergeBboxes(bbox1, bbox2) {
    const mergedBbox = [];

    for (let i = 0; i < bbox1.length; i++) {
        mergedBbox.push((bbox1[i] + bbox2[i]) / 2);
    }

    return mergedBbox;
}

/* Merge two detection results into one better result */
function mergeDetections(detections1, detections2) {
    const mergedDetections = {};

    // Create a set of all labels without duplicates
    const labels1 = Object.keys(detections1);
    const labels2 = Object.keys(detections2);
    const allLabels = new Set([...Object.keys(detections1), ...labels2]);

    for (const label of allLabels) {
        // Average the bboxes if both labels exist
        if (detections1[label] && detections2[label]) {
            const bbox1 = detections1[label].bbox;
            const bbox2 = detections2[label].bbox;

            detections1[label].bbox = mergeBboxes(bbox1, bbox2); // reuse detections1
            mergedDetections[label] = detections1[label];
        }
        // If only one label detected
        else if (!script.consensusRequired) {
            const data = detections1[label] || detections2[label];
            mergedDetections[label] = data;
        }
    }

    return mergedDetections;
}

/* Gets triggered by MLController when detection results are in */
function onDetectionsUpdated(detections1, detections2) {
    // Delete all existing instances
    // TODO: instead of delete, move the object if its exists already.
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        instance.destroy();
    }

    const detections = mergeDetections(detections1, detections2);
    spawnInstances(detections);
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

script.calibrate = calibrate;
script.updateInstances = updateInstances;
