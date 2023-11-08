const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
import * as console from 'josm/scriptingconsole'

const ArrayList = Java.type('java.util.ArrayList');

const streetPrefixes = new Map();
streetPrefixes.set('W', 'West');
streetPrefixes.set('E', 'East');
streetPrefixes.set('N', 'North');
streetPrefixes.set('S', 'South');

export const lookupPrefix = x => {
	if (streetPrefixes.has(x)) return streetPrefixes.get(x);
	return null;
};

// Creates a Java ArrayList from a JS array
export const toArrayList = x => {
    const list = new ArrayList();
    x.forEach(o => list.add(o));
    return list;
}

// see which of the test ways contains the way's centroid
// returns a Way or null if none contain the center
export const findContainingWay = (way, waysToTest) => {
    
    const wayCentroidEN = Geometry.getCentroid(way.getNodes()); // returns EastNorth
    let returnWay = null;

    for(const tw of waysToTest) {
        const areaEN = Geometry.getAreaEastNorth(tw);

        if (areaEN.contains(wayCentroidEN.east(), wayCentroidEN.north())) {
            returnWay = tw;
            break;
        }
    }

    return returnWay;
}