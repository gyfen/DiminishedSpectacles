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

/* Gets triggered by MLController when detection results are in */
function onDetectionsUpdated(detections) {
    // Delete all existing instances
    // TODO: instead of delete, move the object if its exists already.
    const sceneObj = script.getSceneObject();
    for (let i = 0; i < sceneObj.getChildrenCount(); i++) {
        const instance = sceneObj.getChild(i);
        instance.destroy();
    }

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
