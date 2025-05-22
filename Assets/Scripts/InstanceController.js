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
function parseDetections(detections) {
    for (let i = 0; i < detections.length; i++) {
        const { label, score, bbox, nutriScore } = detections[i];
        // TODO: make this better
        spawnDiminished(
            transformScreenPoint(new vec2(bbox[0], bbox[1])),
            label,
            score,
            nutriScore
        );
    }
}

function calibrate() {
    script.mlController.runOnce();
}

function onDetectionsUpdated(result) {
    // Delete all existing instances
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        instance.destroy();
    }

    parseDetections(result);
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
