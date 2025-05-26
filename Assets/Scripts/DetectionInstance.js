/*
Tracklet
*/

// @input Asset.Material[] materials
const materials = script.materials;

// @input SceneObject meshObject
const meshObject = script.meshObject;
const renderMeshVisual = renderMesh.getComponent("Component.RenderMeshVisual");

// @input Component.Text textComponent
const textComponent = script.textComponent;

const store = global.persistentStorageSystem.store;

let label;
let nutriScore;

/* Public API */
function updateMaterial() {
    // TODO: only clone material if need to switch to a different one
    // assign new material
    const newMaterial = script.materials[store.getInt("overlayType")].clone();

    // TODO: this can also be linear, instead of threshold.
    const alpha = nutriScore > store.getInt("nutriScore") ? 1 : 0; // nutriscore is assigned by instance controller
    const color = newMaterial.mainPass.baseColor;
    newMaterial.mainPass.baseColor = new vec4(color.x, color.y, color.z, alpha);

    script.renderMeshVisual.mainMaterial = newMaterial;
}

function setTransform(position, rotation, absoluteWidth, absoluteHeight) {
    const transform = meshObject.getTransform();

    transform.setWorldRotation(rotation);
    transform.setWorldPosition(position);

    const newScale = new vec3(absoluteWidth, transform.getLocalScale.y, absoluteHeight);
    transform.setLocalScale(newScale);
}

function setData(newLabel, newNutriScore) {
    nutriScore = newNutriScore;
    label = newLabel;
    script.textComponent.text = label;
}

script.updateMaterial = updateMaterial;
script.setData = setData;
script.setTransform = setTransform;
