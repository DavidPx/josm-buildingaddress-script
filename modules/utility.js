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