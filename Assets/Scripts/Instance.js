// assigned by instance controller
let nutriScore;

const store = global.persistentStorageSystem.store;

function updateMaterial() {
    if (nutriScore < store.getInt("nutriScore")) {
        // diminish
    }
}

script.updateMaterial = updateMaterial;
