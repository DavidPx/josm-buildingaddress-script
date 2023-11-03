import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'

const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const BBox = Java.type('org.openstreetmap.josm.data.osm.BBox');
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const PolygonIntersection = Java.type('org.openstreetmap.josm.tools.Geometry.PolygonIntersection');
const MergeSourceBuildingVisitor = Java.type('org.openstreetmap.josm.data.osm.visitor.MergeSourceBuildingVisitor');

const workingLayer = josm.layers.get("working");
const buildingLayer = josm.layers.get("buildings.osm");
const parcelLayer = josm.layers.get("V900_Wisconsin_Parcels_OZAUKEE.geojson");

const buildingDataSet = buildingLayer.getDataSet();
const selectedBuildings = buildingDataSet.getAllSelected();

if (selectedBuildings.length === 0)
{
	throw new Error("Nothing Selected");
}

const streetPrefixes = new Map();
streetPrefixes.set('W', 'West');
streetPrefixes.set('E', 'East');
streetPrefixes.set('N', 'North');
streetPrefixes.set('S', 'South');

const lookupPrefix = x => {
	if (streetPrefixes.has(x)) return streetPrefixes.get(x);
	return null;
};

const parcelData = parcelLayer.getDataSet();

// accumulate the BBoxes of our buildings in order to narrow down the parcel search
let bigBBox = null;
for (const building of selectedBuildings) {
	if (bigBBox === null) {
		bigBBox = new BBox(building);
	}
	else {
		// TODO: be more accurate with this.  Don't exapnd with each building, just do one at the end of the list.
		bigBBox.addPrimitive(building, 0.0005);
	}
}

const candidateParcels = parcelData.searchWays(bigBBox);

const buildingDataSetUtil = new DataSetUtil(buildingDataSet);
const workingDataSetUtil = new DataSetUtil(workingLayer.getDataSet());

// find what city we're in.  This will likely break if working on the boundary.  Use an intersection test instead?  But then you'd get multiple matches.
const cityMatches = workingDataSetUtil.query("type:relation AND admin_level=8");
let ourCity = null;

for (const cityRelation of cityMatches) {
	if (cityRelation.getBBox().bounds(bigBBox)) {
		ourCity = cityRelation;
		break;
	}
}

if (ourCity === null) {
	throw Error("City not found!");
}

console.println(`we are in city ${ourCity.get("name")}`);

// batch the building updates
buildingDataSetUtil.batch(() => {
	for (const building of selectedBuildings) {
	if (building.getType() !== OsmPrimitiveType.WAY || !building.isClosed()) continue;

	for (const candidate of candidateParcels) {
		const result = Geometry.polygonIntersection(Geometry.getArea(building.getNodes()), Geometry.getArea(candidate.getNodes()));
	
		if (result === PolygonIntersection.FIRST_INSIDE_SECOND) {
			const tags = candidate.getKeys();
			const siteAddress = tags["SITEADRESS"];
			console.println(siteAddress);

			const prefix = lookupPrefix(tags["PREFIX"]);

			// Find the highway in the dataset.  OSM uses full street names instead of abbreviations
			const startsWithMatches = workingDataSetUtil.query(`type:way AND highway AND name~${tags["STREETNAME"]}.*`).map(x => x.get("name")).reduce((acc, curr) => { 
				if (!acc.includes(curr)) {
					acc.push(curr);
				} 
				return acc;
				}, []);
			
			let roadName = null;

			if (startsWithMatches.length === 1) {
				roadName = startsWithMatches[0];
			}
			else {
				const fuzzyMatches = workingDataSetUtil.query(`type:way AND highway AND name:${tags["STREETNAME"]}`);

				const roadNames = fuzzyMatches.map(x => x.get("name")).reduce((acc, curr) => { 
					if (!acc.includes(curr)) {
						acc.push(curr);
					} 
					return acc;
					}, []);
				if (roadNames.length === 0) {
					console.println(`Unable to find a road, skipping`);
					continue
				}
				else if (roadNames.length > 1) {
					
					console.println(`Multiple road matches! Narrowing by prefix: ${roadNames}`);
					const betterMatch = roadNames.filter(x => x.startsWith(prefix));
					if (betterMatch.length === 1) {
						roadName = betterMatch[0];
						console.println(`got a road! ${roadName}`);
					}
					else if (betterMatch.length > 1) {
						console.println("Still multiple possibilities; skipping.");
						console.println(betterMatch.join(","));
						continue;
					}
					else {
						console.println("Filtering by prefix failed to find a match");
						continue;
					}
				}
				else {
					roadName = fuzzyMatches[0].get("name");
					console.println(`got a road!  ${roadName}`);
				}
			}

			building.setKeys(null);
			
			building.put("addr:city", ourCity.get("name"));
			building.put("addr:postcode", tags["ZIPCODE"]);
			building.put("addr:street", roadName);
			building.put("addr:housenumber", tags["ADDNUM"]);
			building.put("building", "yes");
		}
	}
}
});

// merge selected to the working layer
// https://josm.openstreetmap.de/browser/josm/trunk/src/org/openstreetmap/josm/actions/MergeSelectionAction.java#L43
const builder = new MergeSourceBuildingVisitor(buildingDataSet);
workingLayer.mergeFrom(builder.build());
