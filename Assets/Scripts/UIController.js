// @input Component.ScriptComponent instanceController
const instanceController = script.instanceController;

// @input Component.ScriptComponent nutriScoreSlider
const nutriScoreSlider = script.nutriScoreSlider;

const store = global.persistentStorageSystem.store;

function OnStart() {
    // set slider value from storage
    nutriScoreSlider.currentValue = store.getInt("nutriScore") || 0.0;
}

function calibrate() {
    instanceController.calibrate();
}

function updateNutriScore() {
    const newNutriScore = nutriScoreSlider.currentValue | 0;
    print(newNutriScore);
    store.putInt("nutriScore", newNutriScore);
    instanceController.updateTrackletsMaterial();
}

script.createEvent("OnStartEvent").bind(OnStart);
//init();

script.calibrate = calibrate;
script.updateNutriScore = updateNutriScore;
