import josm from 'josm'
//import * as console from 'josm/scriptingconsole'
import { titleCase } from "title-case/dist/index";

const OsmPrimitiveType = Java.type('org.openstreetmap.josm.data.osm.OsmPrimitiveType');
const BBox = Java.type('org.openstreetmap.josm.data.osm.BBox');
const Geometry = Java.type('org.openstreetmap.josm.tools.Geometry');
const PolygonIntersection = Java.type('org.openstreetmap.josm.tools.Geometry.PolygonIntersection');
const MergeSourceBuildingVisitor = Java.type('org.openstreetmap.josm.data.osm.visitor.MergeSourceBuildingVisitor');

const workingLayer = josm.layers.get("working");
const buildingLayer = josm.layers.get("buildings.osm");
const parcelLayer = josm.layers.get("V900_Wisconsin_Parcels_OZAUKEE.geojson");

const selectedBuildings = buildingLayer.getDataSet();
const selected = selectedBuildings.getAllSelected();

if (selected.length === 0)
{
	throw new Error("Nothing Selected");
}

const cityAliases = new Map();
cityAliases.set('CITY OF MEQUON', "Mequon");
const lookupCity = n => {
		if (cityAliases.has(n)){
			return cityAliases.get(n);
		}
		return titleCase(n.toLowerCase());
};

const parcelData = parcelLayer.getDataSet();

// accumulate the BBoxes of our buildings in order to narrow down the parcel search
let bigBBox = null;
for (const building of selected) {
	if (bigBBox === null) {
		bigBBox = new BBox(building);
	}
	else {
		// TODO: be more accurate with this.  Don't exapnd with each building, just do one at the end of the list.
		bigBBox.addPrimitive(building, 0.0005);
	}
}

const candidateParcels = parcelData.searchWays(bigBBox);

//console.println(`searching through ${candidateParcels.length} parcels`);

for (const building of selected) {
	if (building.getType() !== OsmPrimitiveType.WAY || !building.isClosed()) continue;

	for (const candidate of candidateParcels) {
		const result = Geometry.polygonIntersection(Geometry.getArea(building.getNodes()), Geometry.getArea(candidate.getNodes()));
	
		if (result === PolygonIntersection.FIRST_INSIDE_SECOND) {
			const tags = candidate.getKeys();
			//console.println(tags["SITEADRESS"]);

			// TODO: figure out why the buildings are being merged twice; one with the new tags and one with the old.  Something about saving updates to the dataset?
			// TODO this isn't clearing
			building.getKeys().clear();
			
			/*
			Tag TODOS
				- get city from the nearest level 8 boundary
				- get road name from nearest highway way - sanity check with streetname tag
			*/
			building.put("addr:city", lookupCity(tags["PLACENAME"]));
			building.put("addr:postcode", tags["ZIPCODE"]);
			building.put("addr:street", `${tags["PREFIX"]} ${titleCase(tags["STREETNAME"].toLowerCase())}`);
			building.put("addr:housenumber", tags["ADDNUM"]);
			building.put("building", "yes");

			// https://josm.openstreetmap.de/browser/josm/trunk/src/org/openstreetmap/josm/actions/MergeSelectionAction.java#L43
			// TODO: see if the builder can be created just once outside the loop
			const builder = new MergeSourceBuildingVisitor(buildingLayer.getDataSet());
			workingLayer.mergeFrom(builder.build());
		}
	}
}
