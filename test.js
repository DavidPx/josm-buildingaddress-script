import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'
import { findContainingWay } from 'utility';

const activeLayer = josm.layers.activeLayer;

const activeDataSet = activeLayer.getDataSet();
const dataSetUtil = new DataSetUtil(activeDataSet);

const selectedBuilding = activeDataSet.getAllSelected().toArray()[0];

const parcels = dataSetUtil.query("type:way AND STATE=WI");

const result = findContainingWay(selectedBuilding, parcels);

console.println(`containing way: ${result.getKeys().get("ADDNUM")}`);

