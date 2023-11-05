
/*
    Finds ways with the "Ways with same position" error

    Lets you perform a custom selection for batch updates within JOSM
*/
import josm from 'josm'
import * as console from 'josm/scriptingconsole'

const DupeWaysTest = Java.type('org.openstreetmap.josm.data.validation.tests.DuplicateWay');

const activeLayer = josm.layers.activeLayer;
const ds = activeLayer.getDataSet();

const dupeWaysTest = new DupeWaysTest();

const waysToTest = ds.getWays();
console.println(`ways to test: ${waysToTest.toArray().length}`);

dupeWaysTest.startTest(null);
for (const way of waysToTest) {
    dupeWaysTest.visit(way);
}
dupeWaysTest.endTest();

const errors = dupeWaysTest.getErrors();

if (errors.length === 0) {
    console.println('no errors!');
}
else {
    let i = 0;
    console.println(`error count: ${errors.length}`);
    for (const error of errors) {
        ds.addSelected(error.getPrimitives().toArray().filter(x => x.get("capture_dates_range") !== null));
    }
}
