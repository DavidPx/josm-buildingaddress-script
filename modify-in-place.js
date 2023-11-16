import josm from 'josm'
import { assert } from 'josm/util';
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'
import { buildChangeCommand } from 'josm/command'
import { lookupPrefix, findContainingWay } from 'utility';


const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const BBox = Java.type('org.openstreetmap.josm.data.osm.BBox');
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const PolygonIntersection = Java.type('org.openstreetmap.josm.tools.Geometry.PolygonIntersection');

const activeLayer = josm.layers.activeLayer;
const parcelLayer = josm.layers.get("V900_Wisconsin_Parcels_OZAUKEE.geojson");

const activeDataSet = activeLayer.getDataSet();
const selectedBuildings = activeDataSet.getAllSelected().toArray();

let t = Date.now();
const printElapsed = (msg) => {
	const z = Date.now();
	console.println(`${z - t}ms\t${msg}`);
	t = z;
}

assert(selectedBuildings.length > 0, "Nothing selected");

const parcelData = parcelLayer.getDataSet();

// accumulate the BBoxes of our buildings in order to narrow down the parcel search
let bigBBox = new BBox();
for (let i = 0; i < selectedBuildings.length; ++i) {
	const building = selectedBuildings[i];
	const extra = i === selectedBuildings.length - 1 ? 0.003 : 0;
	bigBBox.addPrimitive(building, extra);
}

printElapsed("computed BBox");

const candidateParcels = parcelData.searchWays(bigBBox).filter(p => p.get("skip") === null);

printElapsed("searched for parcels");

const buildingDataSetUtil = new DataSetUtil(activeDataSet);

// find what city we're in.  This might break if working on the boundary.  Use an intersection test instead?  But then you'd get multiple matches.
const cityMatches = buildingDataSetUtil.query("type:relation AND admin_level=8");

printElapsed("searched for cities");

const getParcelCity = way => {
	const match = cityMatches.find(x => x.getBBox().bounds(way.getBBox()));
	if (match) return match.get("name");
	return null;
}

const buildingsToTouch = selectedBuildings.filter(x => x.getType() == OsmPrimitiveType.WAY && x.isClosed() && !x.get("highway") && !x.get("natural") && !x.get("landuse"));
const touchedBuildings = [];
const streetCache = [];
const extraMessages = [];
const cityMap = [];

printElapsed("filtered buildings");

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
		goodParcel = findContainingWay(building, touchingParcels);
		extraMessages.push(`warning: ${goodParcel.get("SITEADDRESS")} overlapped ${touchingParcels.length} parcels; checkme=yes has been set`);
		building.put("checkme", "yes");
	}

	if (goodParcel) {
		/*
		Ozaukee data looks like this:
		SiteAddress=10055N SHERIDAN DRIVE
		State=WI
		Zip=53092
		city=MEQUON // need to title-case it
		*/
		const tags = goodParcel.getKeys();
		const siteAddress = tags["SITEADRESS"];
		if (!siteAddress) {
			extraMessages.push(`parcel with no address!  skipping.  Building center is ${building.getBBox().getCenter()}.  checkme=yes has been set`);
			building.put("checkme", "yes");
			goodParcel.put("checkme", "yes");
			continue;
		}
		//console.println(siteAddress);

		const prefix = lookupPrefix(tags["PREFIX"]);
		const streetName = tags["STREETNAME"];
		const streetNameNoSpaces = streetName.replace(" ", "");
		const streetType = tags["STREETTYPE"];
		const suffixLetter = tags["SUFFIX"]; // N, W, E, S
		const cacheKey = `${prefix} ${streetName} ${streetType}`;

		// Regular expressions (~) are used for case-insensitive exact matches.  ":" is a partial match.
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
					//console.println(`multiple matches for ${nameQuery}! ${matches}`);
				}
				else {
					//console.println(`no matches for ${nameQuery}`);
				}
			}
		}

		if (roadName === null) {
			extraMessages.push(`Could not find an OSM road for ${siteAddress}; checkme=yes has been set`);
			building.put("checkme", "yes");
			continue;
		};

		// resolve city
		const placeName = tags["PLACENAME"];
		const cityLookup = cityMap.find(x => x.placeName === placeName);
		let cityName = "";
		if (!cityLookup) {
			cityName = getParcelCity(building);
			if (!cityName) {
				extraMessages.push(`Could not determine city for ${siteAddress}; relationship and all members needs to be downloaded`);
				continue;
			}
			cityMap.push({ placeName: placeName, osmName: cityName });
		}
		else {
			cityName = cityLookup.osmName;
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

		building.remove("checkme");

		touchedBuildings.push(building);
	}


}

printElapsed("matched addresses");

// redo the selection in order to JOSM to recognize changed ways; this lets us easily do "upload selected"
activeDataSet.clearSelection();
activeDataSet.setSelected(touchedBuildings);

//console.println(`Done!`);
if (touchedBuildings.length === buildingsToTouch.length) {
	josm.alert(`All ${buildingsToTouch.length} buildings were addressed!`);
}
else {
	josm.alert(`${touchedBuildings.length}/${buildingsToTouch.length} buildings addressed.  Problems:\n\n${extraMessages.join('\n')}`);
}
