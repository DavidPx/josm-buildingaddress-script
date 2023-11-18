import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const Node = Java.type("org.openstreetmap.josm.data.osm.Node");
const LatLon = Java.type("org.openstreetmap.josm.data.coor.LatLon");
const EastNorth = Java.type("org.openstreetmap.josm.data.coor.EastNorth");
const Way = Java.type("org.openstreetmap.josm.data.osm.Way");
const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const ProjectionRegistry = Java.type('org.openstreetmap.josm.data.projection.ProjectionRegistry');

import { NodeBuilder, WayBuilder } from 'josm/builder'
import { buildAddCommand } from 'josm/command'

const radToDegree = (r) => r * 180 / Math.PI;

const projection = ProjectionRegistry.getProjection();
const activeLayer = josm.layers.activeLayer;

const activeDataSet = activeLayer.getDataSet();
const nodeBuilder = NodeBuilder.forDataSet(activeDataSet);
const wayBuilder = WayBuilder.forDataSet(activeDataSet);

const selectedPrimitives = activeDataSet.getAllSelected().toArray();

const buildingsToTouch = selectedPrimitives.filter(x => x.getType() == OsmPrimitiveType.WAY && x.isClosed());

for (const way of buildingsToTouch) {

    // find the most distant pair of nodes; this will be the long side of the building
    // could get more fancy by finding the way segment that's in line with the longes axis
    let longestDistance = 0;
    let longestPair = null;
    let longestIndex = 0;
    let i = 0;

    const data = [];

    const pairs = way.getNodePairs(false);

    for (const pair of pairs) {
        // static double Slope(Point a, Point b) => (a.Y - b.Y) / (a.X - b.X);
        // static double AngleFromHorizontal(Point a, Point b) => Math.Atan(Slope(a, b)) * 180 / Math.PI;
        const lonA = pair.a.lon();
        const lonB = pair.b.lon();
        const latA = pair.a.lat();
        const latB = pair.b.lat();
        const slope = (latA - latB) / (lonA - lonB);

        const angleFromHorizontal = Math.atan(slope);// * 180 / Math.PI;

        const length = Math.sqrt(Math.pow(latA - latB, 2) + Math.pow(lonA - lonB, 2));
        //console.println(`slope: ${slope}, angle: ${angleFromHorizontal}`);

        // static double Dist(Point a, Point b) => Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2));
        data.push({
            angle: angleFromHorizontal,
            angleBucket: Math.round(angleFromHorizontal),
            length: length
        });

        const enA = pair.a.getEastNorth(projection);
        const enB = pair.b.getEastNorth(projection);
        const enC = enB.add(0, 20); // straight up

        const geometryAngle = Geometry.getCornerAngle(enA, enB, enC);

        console.println(`way: ${angleFromHorizontal * 180 / Math.PI}, length: ${length}.  geometryAngle: ${radToDegree(geometryAngle)}, geometryAngleNormalized: ${Geometry.getNormalizedAngleInDegrees(geometryAngle)} `);
    }

    // OSB buildings are prettb angular so we're not going to get buildings with a wide variety of angles.
    // If a given angle is +- a few degrees from the bucket include it
    // If a building is being troublesome straighten it out with ctrl+q
    const angleFudge = 0.0261799;
    const stats = data.reduce((acc, curr) => {
        const bucket = acc.find(x => x.angleAverage2 > curr.angle - angleFudge && x.angleAverage2 < curr.angle + angleFudge);
        if (!bucket) {
            acc.push({
                totalAngle: curr.angle,
                angleAverage: curr.angle,
                angleAverage2: curr.angle,
                totalLength: curr.length,
                count: 1
            });
        }
        else {
            bucket.count++;
            bucket.totalLength += curr.length;
            bucket.totalAngle += curr.angle;
            // keep a running average of the angle
            bucket.angleAverage = bucket.angleAverage + (curr.angle - bucket.angleAverage) / bucket.count;
            bucket.angleAverage2 = bucket.totalAngle / bucket.count;
        }
        return acc;
    }, []);

    // var winningSegment = data.Where(x => x.AngleBucket == winner.Key).OrderByDescending(x => x.Length).First();
    const winningBucket = stats.reduce((acc, curr) => {
        if (curr.totalLength > acc) return curr;
        return acc;
    }, 0);

    console.println(`stats: ${JSON.stringify(stats)}`);
    console.println(`winning bucket: ${winningBucket.angleAverage * 180 / Math.PI}`);


    // center of building
    const centroid = Geometry.getCentroid(way.getNodes());

    const bisectAngle = winningBucket.angleAverage + Math.PI / 2;
    const bisectLength = 0.005;

    // create the bisection way
    const middleNode = new Node(centroid);
    const middleLat = middleNode.lat();
    const middleLon = middleNode.lon();

    const up = Math.sin(bisectAngle) * bisectLength;
    const over = Math.cos(bisectAngle) * bisectLength;

    const n1LatLon = new LatLon(middleLat + up, middleLon + over);
    const n2LatLon = new LatLon(middleLat - up, middleLon - over);

    console.println(`n1: ${n1LatLon}, n2: ${n2LatLon}`);

    const n1 = nodeBuilder.withPosition(middleLat + Math.sin(bisectAngle) * bisectLength, middleLon + Math.cos(bisectAngle) * bisectLength).create();
    const n2 = nodeBuilder.withPosition(middleLat - Math.sin(bisectAngle) * bisectLength, middleLon - Math.cos(bisectAngle) * bisectLength).create();

    const bisectWay = wayBuilder.withNodes(n1, n2).create();

    buildAddCommand(bisectWay).applyTo(activeLayer);
}
