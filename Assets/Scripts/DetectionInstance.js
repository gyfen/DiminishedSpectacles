/*
Instance
*/

// @input Asset.Material[] materials

const store = global.persistentStorageSystem.store;
const renderMeshVisual = script.sceneObject.getComponent("Component.RenderMeshVisual");

function updateMaterial() {
    // TODO: only clone material if need to switch to a different one
    // assign new material
    const newMaterial = script.materials[store.getInt("overlayType")].clone();

    // TODO: this can also be linear, instead of threshold.
    const alpha = script.nutriScore < store.getInt("nutriScore") ? 0 : 1; // nutriscore is assigned by instance controller
    const color = newMaterial.mainPass.baseColor;
    newMaterial.mainPass.baseColor = new vec4(color.x, color.y, color.z, alpha);

    renderMeshVisual.mainMaterial = newMaterial;
}

/* Public API */
script.updateMaterial = updateMaterial;
script.nutriScore;
