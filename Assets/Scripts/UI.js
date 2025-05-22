// @input Component.ScriptComponent instanceController
const instanceController = script.instanceController;

// @input Component.ScriptComponent nutriScoreSlider
const nutriScoreSlider = script.nutriScoreSlider;

const store = global.persistentStorageSystem.store;


function init() {
    nutriScoreSlider.startValue = store.getInt("nutriScore") || 1.0;
}

function calibrate() {
    instanceController.calibrate();
}
    
function updateNutriScore() {
    const newNutriScore = nutriScoreSlider.currentValue | 0
    store.putInt("nutriScore", newNutriScore);
    instanceController.updateInstances();
}

init();

script.calibrate = calibrate;
script.updateNutriScore = updateNutriScore;