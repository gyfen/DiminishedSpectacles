/*
Instance
*/

// @input Asset.Material[] materials

// @input Component.Text textComponent

const store = global.persistentStorageSystem.store;
const renderMeshVisual = script.sceneObject.getComponent("Component.RenderMeshVisual");

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

    renderMeshVisual.mainMaterial = newMaterial;
}

function setData(label, nutriScore) {
    let nutriScore = nutriScore;
    let label = label;

    script.textComponent.text = label;
}

script.updateMaterial = updateMaterial;
script.setData = setData;
