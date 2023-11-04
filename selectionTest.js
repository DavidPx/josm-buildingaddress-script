import josm from 'josm'
import * as console from 'josm/scriptingconsole'

const workingLayer = josm.layers.activeLayer;
const dataSet = workingLayer.getDataSet();
const selections = dataSet.getAllSelected().toArray();
//console.println(selections);
console.println(`selection count: ${selections.length}`);
console.println(selections);

if (selections.length > 0) {
    dataSet.clearSelection(selections[0]);
}
