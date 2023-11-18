import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { assert } from 'josm/util';
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
import {NodeBuilder, WayBuilder} from 'josm/builder'
import {buildAddCommand} from 'josm/command'

const activeLayer = josm.layers.activeLayer;

const activeDataSet = activeLayer.getDataSet();

const selectedPrimitives = activeDataSet.getAllSelected().toArray();

assert(selectedPrimitives.length == 2, "only two ways please");

const buildingWay = selectedPrimitives.find(x => x.isClosed());
const lineWay = selectedPrimitives.find(x => !x.isClosed());

assert(buildingWay && lineWay, "select a building and a bisection line");

const intersections = Geometry.addIntersections(selectedPrimitives, false, []);

console.println(`intersect nodes: ${intersections}`);

buildAddCommand(intersections).applyTo(activeLayer);

for (const node of intersections) {
    const ws = Geometry.getClosestWaySegment(buildingWay, node);
    console.println(`best segment: ${ws}`);
    buildingWay.addNode(ws.getUpperIndex(), node);
}

activeDataSet.clearSelection();
activeDataSet.setSelected(intersections);
activeDataSet.removePrimitive(lineWay);
activeDataSet.removePrimitives(lineWay.getNodes());

