import josm from 'josm'
import * as console from 'josm/scriptingconsole'
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const Node = Java.type("org.openstreetmap.josm.data.osm.Node");
const Way = Java.type("org.openstreetmap.josm.data.osm.Way");
const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const ProjectionRegistry = Java.type('org.openstreetmap.josm.data.projection.ProjectionRegistry');

import { buildAddCommand } from 'josm/command'

const radToDegree = (r) => r * 180 / Math.PI;
const OneEightyDegreesInRadians = Math.PI;

console.clear();
const projection = ProjectionRegistry.getProjection();
const activeLayer = josm.layers.activeLayer;

const activeDataSet = activeLayer.getDataSet();

const selectedPrimitives = activeDataSet.getAllSelected().toArray();

const buildingsToTouch = selectedPrimitives.filter(x => x.getType() == OsmPrimitiveType.WAY && x.isClosed());

activeDataSet.clearSelection();

for (const way of buildingsToTouch) {

    // find the most distant pair of nodes; this will be the long side of the building
    // could get more fancy by finding the way segment that's in line with the longes axis

    const data = [];

    const pairs = way.getNodePairs(false);

    for (const pair of pairs) {

        const enA = pair.a.getEastNorth(projection);
        const enB = pair.b.getEastNorth(projection);

        let headingRadians = enA.heading(enB);
        if (headingRadians > OneEightyDegreesInRadians) headingRadians -= OneEightyDegreesInRadians;

        data.push({
            angle: headingRadians,
            length: enA.distance(enB),
        });

        //console.println(`heading: ${radToDegree(headingRadians)}, dist: ${enA.distance(enB)}`);
    }

    // OSB buildings are prettb angular so we're not going to get buildings with a wide variety of angles.
    // If a given angle is +- a few degrees from the bucket include it
    // If a building is being troublesome straighten it out with ctrl+q
    const angleFudge = 0.0261799;
    const stats = data.reduce((acc, curr) => {
        const bucket = acc.find(x => x.angleAverage > curr.angle - angleFudge && x.angleAverage < curr.angle + angleFudge);
        if (!bucket) {
            acc.push({
                totalAngle: curr.angle,
                angleAverage: curr.angle,
                totalLength: curr.length,
                count: 1
            });
        }
        else {
            bucket.count++;
            bucket.totalLength += curr.length;
            bucket.totalAngle += curr.angle;
            // keep a running average of the angle
            bucket.angleAverage = bucket.totalAngle / bucket.count;
        }
        return acc;
    }, []);

    const winningBucket = stats.reduce((acc, curr) => {
        if (curr.totalLength > acc.totalLength) return curr;
        return acc;
    });

    //console.println(`stats: ${JSON.stringify(stats)}`);
    for(const stat of stats) {
    	console.println(`${JSON.stringify(stat)} - heading is ${radToDegree(stat.angleAverage)}`);
    }
    console.println(`winning bucket: ${radToDegree(winningBucket.angleAverage)} - ${JSON.stringify(winningBucket)}`);

    // center of building
    const centroidEN = Geometry.getCentroid(way.getNodes());

    // make a crossing way so that we can run the handy intersect function
    const end1 = centroidEN.add(150, 0);
    const end2 = centroidEN.add(-150, 0);

    const end1final = end1.rotate(centroidEN, winningBucket.angleAverage);
    const end2final = end2.rotate(centroidEN, winningBucket.angleAverage);

    const n1 = new Node(end1final);
    const n2 = new Node(end2final);

    const bisectWay = new Way();
    bisectWay.addNode(n1);
    bisectWay.addNode(n2);

	buildAddCommand(n1, n2, bisectWay).applyTo(activeLayer); 

    // TODO: look into the add commands this can populate
    const intersections = Geometry.addIntersections([bisectWay, way], false, []);

	buildAddCommand(intersections).applyTo(activeLayer); 

    for (const node of intersections) {
        const ws = Geometry.getClosestWaySegment(way, node);
        way.addNode(ws.getUpperIndex(), node);
    }
	
    //activeDataSet.removePrimitive(bisectWay);
    //activeDataSet.removePrimitives(bisectWay.getNodes());
    activeDataSet.setSelected(intersections);
}
