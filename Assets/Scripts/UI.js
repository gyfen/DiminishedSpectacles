// @input Component.ScriptComponent instanceController
const instanceController = script.instanceController;

// @input Component.ScriptComponent nutriScoreSlider
const nutriScoreSlider = script.nutriScoreSlider;

const store = global.persistentStorageSystem.store;


function init() {
    // set slider value from storage
    nutriScoreSlider.currentValue = store.getInt("nutriScore") || 1.0;
}

function calibrate() {
    instanceController.calibrate();
}
    
function updateNutriScore() {
    const newNutriScore = nutriScoreSlider.currentValue | 0
    store.putInt("nutriScore", newNutriScore);
    instanceController.updateInstances();
}

script.createEvent("OnStartEvent").bind(init);
//init();

script.calibrate = calibrate;
script.updateNutriScore = updateNutriScore;