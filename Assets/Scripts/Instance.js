// @input Asset.Material[] materials

const store = global.persistentStorageSystem.store;
const renderMeshVisual = script.sceneObject.getComponent("Component.RenderMeshVisual");

function updateMaterial() {
    // assign new material
    const newMaterial = script.materials[store.getInt("overlayType")].clone();

    const alpha = script.nutriScore < store.getInt("NutriScore") ? 0 : 1; // nutriscore is assigned by instance controller
    const color = newMaterial.mainPass.baseColor;
    newMaterial.mainPass.baseColor = new vec4(color.x, color.y, color.z, alpha);

    renderMeshVisual.mainMaterial = newMaterial;
}

script.updateMaterial = updateMaterial;
