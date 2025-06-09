/*
Tracklet
*/

// @input Asset.Material[] materials
const materials = script.materials;

// @input SceneObject meshContainerObject
const meshContainerObject = script.meshContainerObject;

// @input SceneObject boxMeshObject
const boxMeshObject = script.boxMeshObject;

// @input SceneObject planeMeshObject
const planeMeshObject = script.planeMeshObject;

const boxRenderMeshVisual = boxMeshObject.getComponent("Component.RenderMeshVisual");
// const planeRenderMeshVisual = planeMeshObject.getComponent("Component.RenderMeshVisual");

// @input Component.Text textComponent
const textComponent = script.textComponent;

// persistent storage
const store = global.persistentStorageSystem.store;

let label;
let nutriScore;

/* Public API */
function updateAppearance() {
    // TODO: only clone material if need to switch to a different one
    // assign new material

    const nutriScoreThreshold = store.getInt("nutriScore");
    // the visual effect
    const effectType = store.getInt("effectType");
    // threshold or linear
    const effectMode = store.getInt("effectMode");
    // label visiblity (de debugging)
    const showLabels = Boolean(store.getInt("showLabels"));

    let alpha = 0;

    switch (effectMode) {
        case 0:
            alpha = nutriScore > nutriScoreThreshold ? 1 : 0;
            break;
        case 1:
            alpha = nutriScore / 4;
            break;
    }

    switch (effectType) {
        // solid overlay
        case 0:
        // desaturate
        case 1:
        // blur
        case 2:
            boxMeshObject.enabled = true;
            planeMeshObject.enabled = false;

            const newMaterial = script.materials[effectType].clone();

            // TODO: this can also be linear, instead of threshold.
            newMaterial.mainPass.alpha = alpha;

            boxRenderMeshVisual.mainMaterial = newMaterial;
            break;
        // outline is a special case
        case 3:
            boxMeshObject.enabled = false;

            planeMeshObject.enabled = Boolean(nutriScore <= nutriScoreThreshold);
            break;
    }

    // Set label visibility
    script.textComponent.enabled = showLabels;
}

function setTransform(position, rotation, absoluteWidth, absoluteHeight) {
    const sceneObjectTransform = script.getSceneObject().getTransform();
    const meshTransform = meshContainerObject.getTransform();

    sceneObjectTransform.setWorldRotation(rotation);
    sceneObjectTransform.setWorldPosition(position);

    const newScale = new vec3(absoluteWidth, meshTransform.getLocalScale().y, absoluteHeight);
    meshTransform.setLocalScale(newScale);
}

function setData(newLabel, newNutriScore) {
    nutriScore = newNutriScore;
    label = newLabel;
    script.textComponent.text = label;
}

script.updateAppearance = updateAppearance;
script.setData = setData;
script.setTransform = setTransform;
