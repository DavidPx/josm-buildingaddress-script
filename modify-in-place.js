import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'
import {
	buildChangeCommand
} from 'josm/command'

const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const BBox = Java.type('org.openstreetmap.josm.data.osm.BBox');
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const PolygonIntersection = Java.type('org.openstreetmap.josm.tools.Geometry.PolygonIntersection');

const buildingLayer = josm.layers.activeLayer;
const parcelLayer = josm.layers.get("V900_Wisconsin_Parcels_OZAUKEE.geojson");

const buildingDataSet = buildingLayer.getDataSet();
const selectedBuildings = buildingDataSet.getAllSelected();

if (selectedBuildings.length === 0) {
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

// find what city we're in.  This will likely break if working on the boundary.  Use an intersection test instead?  But then you'd get multiple matches.
const cityMatches = buildingDataSetUtil.query("type:relation AND admin_level=8");
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

const buildingsToTouch = selectedBuildings.toArray().filter(x => x.getType() == OsmPrimitiveType.WAY && x.isClosed());
const touchedBuildings = [];

for (const building of buildingsToTouch) {

	for (const candidate of candidateParcels) {
		const result = Geometry.polygonIntersection(Geometry.getArea(building.getNodes()), Geometry.getArea(candidate.getNodes()));

		if (result === PolygonIntersection.FIRST_INSIDE_SECOND) {
			const tags = candidate.getKeys();
			const siteAddress = tags["SITEADRESS"];
			console.println(siteAddress);

			const prefix = lookupPrefix(tags["PREFIX"]);
			const streetName = tags["STREETNAME"];
			const streetNameNoSpaces = streetName.replace(" ", "");
			const streetType = tags["STREETTYPE"];

			const nameQueries = [`name~"${prefix} ${streetName} ${streetType}"`, `name~"${prefix} ${streetNameNoSpaces} ${streetType}"`, `name:"${streetName} ${streetType}"`, `name:"${streetNameNoSpaces} ${streetType}"`];
			let roadName = null;

			for (const nameQuery of nameQueries) {
				const matches = buildingDataSetUtil.query(`type:way AND highway AND ${nameQuery}`).map(x => x.get("name")).reduce((acc, curr) => {
					if (!acc.includes(curr)) {
						acc.push(curr);
					}
					return acc;
				}, []);
				if (matches.length === 1) {
					roadName = matches[0];
					console.println(`${nameQuery} had one match!`);
					break;
				}
				else if (matches.length > 1) {
					console.println(`multiple matches for ${nameQuery}! ${matches}`);
				}
				else {
					console.println(`no matches for ${nameQuery}`);
				}
			}

			if (roadName === null) {
				console.println(`skipping`);
				continue;
			};

			const newTags = {
				"addr:city": ourCity.get("name"),
				"addr:postcode": tags["ZIPCODE"],
				"addr:street": roadName,
				"addr:housenumber": tags["ADDNUM"],
			};

			if (building.get("building") === null) {
				newTags.building = "yes";
			}

			buildChangeCommand(building, {
				tags: newTags
			}).applyTo(buildingLayer);

			// MS Building Outline data has these foreign tags
			building.remove("capture_dates_range");
			building.remove("release");

			touchedBuildings.push(building);
		}
	}
}

// redo the selection in order to JOSM to recognize changed ways; this lets us easily do "upload selected"
buildingDataSet.clearSelection();
buildingDataSet.setSelected(touchedBuildings);

console.println(`Done!`);