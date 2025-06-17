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
const planeRenderMeshVisual = planeMeshObject.getComponent("Component.RenderMeshVisual");

// @input Component.Text textComponent
const textComponent = script.textComponent;

//@input vec4 nutriScoreAColor {"widget":"color"}
//@input vec4 nutriScoreBColor {"widget":"color"}
//@input vec4 nutriScoreCColor {"widget":"color"}
//@input vec4 nutriScoreDColor {"widget":"color"}
//@input vec4 nutriScoreEColor {"widget":"color"}

const nutriScoreColors = [
    script.nutriScoreAColor,
    script.nutriScoreBColor,
    script.nutriScoreCColor,
    script.nutriScoreDColor,
    script.nutriScoreEColor,
];

//@input vec4 baseColor {"widget": "color"}
const baseColor = script.baseColor;

// persistent storage
const store = global.persistentStorageSystem.store;

let label;
let data;

let nutriScoreThreshold = -1;
let effectType = -1;
let effectMode = -1;
let showLabels = -1;

/* Public API */
function updateAppearance() {
    // TODO: only clone material if need to switch to a different one
    // assign new material

    nutriScoreThreshold = store.getInt("nutriScore");
    const newEffectType = store.getInt("effectType");
    effectMode = store.getInt("effectMode");
    showLabels = Boolean(store.getInt("showLabels"));

    let material;

    // only update material if needed
    if (effectType != newEffectType) {
        effectType = newEffectType;

        material = script.materials[effectType].clone();
    } else {
        switch (effectType) {
            case 0:
            case 1:
            case 2:
                material = boxRenderMeshVisual.mainMaterial;
                break;
            case 3:
                material = planeRenderMeshVisual.mainMaterial;
                break;
        }
    }

    let enabled = data.nutriScore > nutriScoreThreshold;
    if (effectType == 3) {
        enabled = !enabled;
    }
    if (!store.getInt("useThreshold")) {
        enabled = true;
    }

    let alpha = 1;
    let color = baseColor;

    // but always update material properties (could be optimized to only change if nutriscore changes)

    switch (effectMode) {
        case 0: // threshold
            break;
        case 1: // alpha
            alpha = effectType == 3 ? 1 - data.nutriScore / 4 : data.nutriScore / 4 ;
            break;
        case 2: // nutriscore color
            color = nutriScoreColors[data.nutriScore];
            break;
        case 3:
            enabled = false;
            break;
    }

    switch (effectType) {
        // solid overlay
        case 0:
        // desaturate
        case 1:
        // blur
        case 2:
            material.mainPass.alpha = alpha;
            material.mainPass.baseColor = color;

            boxMeshObject.enabled = enabled;
            planeMeshObject.enabled = false;

            boxRenderMeshVisual.mainMaterial = material;
            break;
        // outline is a special case
        case 3:
            material.mainPass.alpha = alpha;
            material.mainPass.baseColor = color;

            boxMeshObject.enabled = false;
            planeMeshObject.enabled = enabled;

            planeRenderMeshVisual.mainMaterial = material;
            break;
    }

    textComponent.enabled = showLabels;
}

function setTransform(position, rotation, absoluteWidth, absoluteHeight) {
    const sceneObjectTransform = script.getSceneObject().getTransform();
    const meshTransform = meshContainerObject.getTransform();

    sceneObjectTransform.setWorldRotation(rotation);
    sceneObjectTransform.setWorldPosition(position);

    const newScale = new vec3(absoluteWidth, meshTransform.getLocalScale().y, absoluteHeight);
    meshTransform.setLocalScale(newScale);
}

function setData(newLabel, newData) {
    // data could store more than just the nutri score...
    label = newLabel;
    data = newData;
    textComponent.text = label;
    textComponent.backgroundSettings.fill.color = nutriScoreColors[data.nutriScore];
}

script.updateAppearance = updateAppearance;
script.setData = setData;
script.setTransform = setTransform;
