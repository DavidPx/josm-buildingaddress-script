import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'
import { buildChangeCommand } from 'josm/command'
import { lookupPrefix } from 'utility';


const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const BBox = Java.type('org.openstreetmap.josm.data.osm.BBox');
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const PolygonIntersection = Java.type('org.openstreetmap.josm.tools.Geometry.PolygonIntersection');

const activeLayer = josm.layers.activeLayer;
const parcelLayer = josm.layers.get("V900_Wisconsin_Parcels_OZAUKEE.geojson");

const activeDataSet = activeLayer.getDataSet();
const selectedBuildings = activeDataSet.getAllSelected().toArray();

if (selectedBuildings.length === 0) {
	throw new Error("Nothing Selected");
}

const parcelData = parcelLayer.getDataSet();

// accumulate the BBoxes of our buildings in order to narrow down the parcel search
let bigBBox = new BBox();
for (let i = 0; i < selectedBuildings.length; ++i) {
	const building = selectedBuildings[i];
	const extra = i === selectedBuildings.length - 1 ? 0.005 : 0;
	bigBBox.addPrimitive(building, extra);
}

const candidateParcels = parcelData.searchWays(bigBBox);

const buildingDataSetUtil = new DataSetUtil(activeDataSet);

// find what city we're in.  This will likely break if working on the boundary.  Use an intersection test instead?  But then you'd get multiple matches.
const cityMatches = buildingDataSetUtil.query("type:relation AND admin_level=8");

const getParcelCity = way => {
	const match = cityMatches.find(x => x.getBBox().bounds(way.getBBox()));
	if (match) return match.get("name");
	return null;
}

const buildingsToTouch = selectedBuildings.filter(x => x.getType() == OsmPrimitiveType.WAY && x.isClosed() && !x.get("highway"));
const touchedBuildings = [];
const streetCache = [];

for (const building of buildingsToTouch) {

	const buildingArea = Geometry.getArea(building.getNodes());
	const touchingParcels = [];
	let goodParcel = null;

	for (const candidate of candidateParcels) {
		const result = Geometry.polygonIntersection(buildingArea, Geometry.getArea(candidate.getNodes()));
		if (result === PolygonIntersection.FIRST_INSIDE_SECOND) {
			goodParcel = candidate;
			break;
		}
		else if (result === PolygonIntersection.CROSSING) {
			//console.println(`touching! ${candidate.get("SITEADRESS")}`);
			touchingParcels.push(candidate);
		}
	}

	// Junk parcel data will overlap some buildings... find the parcel whose center is closest to the building's center
	// I would prefer to figure out which parcel overlaps more area of the building but I can't figure out how to get the area of a java Area object
	if (!goodParcel && touchingParcels.length > 0) {
		//console.println(`looking for closest primitive from ${touchingParcels.map(x => x.get("SITEADRESS"))}`);
		//goodParcel = Geometry.getClosestPrimitive(building, toArrayList(touchingParcels));
		let minDist = -1;
		const buildingCentroid = Geometry.getCentroid(building.getNodes());
		
		for (const tp of touchingParcels) {
			//console.println(`${tp.get("SITEADRESS")}: ${Geometry.getCentroid(tp.getNodes())}`);
			const parcelCentroid = Geometry.getCentroid(tp.getNodes());
			const dist = parcelCentroid.distance(buildingCentroid);
			//console.println(`${tp.get("SITEADRESS")} dist: ${dist}`);
			if (dist < minDist || minDist === -1) {
				minDist = dist;
				goodParcel = tp;
			}
		}
	}

	if (goodParcel) {
		const tags = goodParcel.getKeys();
		const siteAddress = tags["SITEADRESS"];
		if (!siteAddress) {
			console.println(`parcel with no address!  skipping.  Building center is ${building.getBBox().getCenter()}`);
			continue;
		}
		console.println(siteAddress);

		const prefix = lookupPrefix(tags["PREFIX"]);
		const streetName = tags["STREETNAME"];
		const streetNameNoSpaces = streetName.replace(" ", "");
		const streetType = tags["STREETTYPE"];
		const suffixLetter = tags["SUFFIX"]; // N, W, E, S
		const cacheKey = `${prefix} ${streetName} ${streetType}`;

		const nameQueries = [
			`name~"${prefix} ${streetName} ${streetType}"`,
			`name~"${prefix} ${streetNameNoSpaces} ${streetType}"`,
			`name~"${streetName} ${streetType}"`,
			`name~"${streetNameNoSpaces} ${streetType}"`,
			`name:"${streetName} ${streetType} ${suffixLetter}"`,
		];
		let roadName = null;

		const cached = streetCache.find(x => x.parcel === cacheKey);
		if (cached) {
			roadName = cached.osm;
		}
		else {
			for (const nameQuery of nameQueries) {

				const matches = buildingDataSetUtil.query(`type:way AND highway AND ${nameQuery}`).map(x => x.get("name")).reduce((acc, curr) => {
					if (!acc.includes(curr)) {
						acc.push(curr);
					}
					return acc;
				}, []);
				//console.println(`${nameQuery}: ${matches}`);
				if (matches.length === 1) {
					roadName = matches[0];
					streetCache.push({ parcel: cacheKey, osm: roadName });
					break;
				}
				else if (matches.length > 1) {
					console.println(`multiple matches for ${nameQuery}! ${matches}`);
				}
				else {
					//console.println(`no matches for ${nameQuery}`);
				}
			}
		}

		if (roadName === null) {
			console.println(`!!! skipping, could not find a road.`);
			continue;
		};

		const cityName = getParcelCity(building);
		if (!cityName) {
			console.println(`Could not determine city; relationship needs to be downloaded`);
			continue;
		}

		const newTags = {
			"addr:city": cityName,
			"addr:postcode": tags["ZIPCODE"],
			"addr:street": roadName,
			"addr:housenumber": tags["ADDNUM"],
		};

		if (building.get("building") === null) {
			newTags.building = "yes";
		}

		buildChangeCommand(building, {
			tags: newTags
		}).applyTo(activeLayer);

		// MS Building Outline data has these foreign tags
		building.remove("capture_dates_range");
		building.remove("release");

		touchedBuildings.push(building);
	}


}

// redo the selection in order to JOSM to recognize changed ways; this lets us easily do "upload selected"
activeDataSet.clearSelection();
activeDataSet.setSelected(touchedBuildings);

console.println(`Done!`);
