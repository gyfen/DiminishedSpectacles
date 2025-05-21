// @input Asset.Material[] materials

// assigned by instance controller
let nutriScore;

const store = global.persistentStorageSystem.store;
const renderMeshVisual = script.sceneObject.getComponent("Component.RenderMeshVisual");

function updateMaterial() {
    // assign new material
    const newMaterial = script.materials[store.getInt("overlayType")].clone();

    const alpha = nutriScore < store.getInt("nutriScore") ? 0 : 0.5;
    const color = newMaterial.mainPass.baseColor;
    newMaterial.mainPass.baseColor = new vec4(color.x, color.y, color.z, alpha);

    renderMeshVisual.mainMaterial = newMaterial;
}

script.updateMaterial = updateMaterial;
