/*
Detection Controller
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

/* Spawn a prefab */
function spawnDiminished(screenPos, label, score, nutriScore) {
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

    // Update the instance
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

/*  Triggers when detections are updated.
    Spawns prefabs for all
*/
function spawnDetections(detections) {
    for (const [label, data] of Object.entries(detections)) {
        const { confidence, bbox, nutriScore } = data;
        // TODO: make this better
        spawnDiminished(
            transformScreenPoint(new vec2(bbox[0], bbox[1])),
            label,
            confidence,
            nutriScore
        );
    }
}

function calibrate() {
    script.mlController.runOnce();
}

function mergeBboxes(bbox1, bbox2) {
    const mergedBbox = [];

    for (let i = 0; i < bbox1.length; i++) {
        mergedBbox.push((bbox1[i] + bbox2[i]) / 2);
    }

    return mergedBbox;
}

function mergeDetections(detections1, detections2) {
    let mergedDetections = {};

    const labels1 = Object.keys(detections1);
    const labels2 = Object.keys(detections2);
    const allLabels = new Set([...labels1, ...labels2]);

    for (const label of allLabels) {
        // merge
        if (detections1[label] && detections2[label]) {
            const bbox1 = detections1[label].bbox;
            const bbox2 = detections2[label].bbox;

            detections1[label].bbox = mergeBboxes(bbox1, bbox2);
            mergedDetections[label] = detections1[label];
        }
        // take the one which exists
        else if (!script.consensusRequired) {
            const data = detections1[label] || detections2[label];
            mergedDetections[label] = data;
        }
    }

    return mergedDetections;
}

function onDetectionsUpdated(all_detections) {
    // Delete all existing instances
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        instance.destroy();
    }

    const detections = mergeDetections(...all_detections);
    spawnDetections(detections);
}

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
