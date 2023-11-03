# josm-buildingaddress-script
A script for the JOSM Scripting Plugin that synthesizes building and parcel data to create buildings with addressess.

## Prerequisites
- [JOSM](https://josm.openstreetmap.de/)
- [JOSM Scripting Plugin](https://gubaer.github.io/josm-scripting-plugin/)
- [Microsoft Building Outlines Data](https://www.microsoft.com/en-us/maps/bing-maps/building-footprints)
- Parcel Data
    - I downloaded parcels from [my state's GIS site](https://maps.sco.wisc.edu/Parcels/).  If your county runs ArcGIS there should be a REST endpoint to serve the same purpose.

## TODOs
- Figure out how to skip merging a building if it's problematic.  Probably related to removing it from the current selection.