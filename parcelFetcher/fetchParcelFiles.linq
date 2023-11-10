<Query Kind="Statements">
  <NuGetReference>System.Text.Json</NuGetReference>
  <Namespace>System.Net.Http</Namespace>
  <Namespace>System.Text.Json</Namespace>
</Query>

var outputDirectory = new DirectoryInfo("c:/temp/oz/parcelBatches");
if (!outputDirectory.Exists) outputDirectory.Create();

var client = new HttpClient{
BaseAddress = new Uri("https://gis2.co.ozaukee.wi.us/arcgis/rest/services/OZCadastral/MapServer/25/query")};

var u = new UriBuilder();

var countResult = await client.GetStringAsync("?where=1%3D1&returnCountOnly=true&f=json");
var countdoc = JsonDocument.Parse(countResult);

var parcelCount = countdoc.RootElement.GetProperty("count").GetInt32();
Console.WriteLine($"parcel count: {parcelCount}.");

const int batchSize = 400;
var batchCounter = 0;
var batchCount = parcelCount / batchSize;
for (var i = 0; i < parcelCount; i += batchSize)
{
	Console.WriteLine($"Getting batch {batchCounter}/{batchCount}...");
	var segmentResult = await client.GetStreamAsync($"?where=1%3D1&text=&objectIds=&time=&timeRelation=esriTimeRelationOverlaps&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=4326&havingClause=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=${i}&resultRecordCount=${batchSize}&returnExtentOnly=false&sqlFormat=none&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&featureEncoding=esriDefault&f=geojson");
	using var fs = File.OpenWrite(Path.Combine(outputDirectory.FullName, $"oz-parcels-{++batchCounter:0000}.geojson"));
	
	await segmentResult.CopyToAsync(fs);
	
	await fs.FlushAsync();
	fs.Close();
}

