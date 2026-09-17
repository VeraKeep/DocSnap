/** Verify public sitemap/indexability and authenticated-route exclusions. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT=process.cwd(); const read=(p:string)=>readFileSync(join(ROOT,p),"utf8"); const BASE="https://docsnapapp.com";
const EXPECTED_PUBLIC:string[]=[
"/","/about","/billsnap-sales","/booksnap-sales","/changelog","/contact","/contractsnap-sales","/faq","/garagesnap-sales","/homesnap-demo","/homesnap-sales","/meetingsnap-pricing","/meetingsnap-sales","/pricing","/privacy","/receiptsnap-sales","/resources",
"/resources/how-to-scan-documents-with-phone","/resources/searchable-pdf-ocr","/resources/scan-multiple-pages-one-pdf","/resources/how-to-scan-without-losing-quality","/resources/automatic-cropping-straightening","/resources/document-scanner-vs-camera",
"/resources/how-to-organize-scanned-documents","/resources/how-to-digitize-filing-cabinet","/resources/mobile-scanner-privacy","/resources/local-vs-cloud-document-scanning","/resources/receipt-tax-document-scanning","/resources/home-warranty-document-organization",
"/roadmap","/scan","/status","/terms"];
const AUTH_ONLY=["/profile","/receipts","/garage","/meetingsnap","/homesnap","/contracts","/bills","/books"];
const REQUIRED_DISALLOWS=["/profile","/share/","/api/"];
const AUTH_ROUTE_FILES=["src/routes/profile.tsx","src/routes/receipts.tsx","src/routes/garage.tsx","src/routes/meetingsnap.tsx","src/routes/homesnap.tsx","src/routes/contracts.tsx","src/routes/bills.tsx","src/routes/books.tsx"];
const NOINDEX_RE=/noindex|nosnippet|X-Robots-Tag/i;
function publicRouteFile(route:string){return route==="/"?"src/routes/index.tsx":`src/routes${route}.tsx`;}
function fail(msg:string):never{console.error(`FAIL: ${msg}`);process.exit(1);}
function sitemapPaths(){const xml=read("public/sitemap.xml");const locs=Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g),m=>m[1]!);if(!locs.length)fail("no <loc> entries found in public/sitemap.xml");return locs.map(loc=>{const url=new URL(loc);if(url.origin!==BASE)fail(`sitemap <loc> ${loc} does not use expected base ${BASE}`);return url.pathname||"/";});}
function robotsDisallows(){return Array.from(read("public/robots.txt").matchAll(/^Disallow:\s*(\S+)\s*$/gm),m=>m[1]!);}
function main(){const paths=sitemapPaths(),expected=[...EXPECTED_PUBLIC].sort(),actual=[...paths].sort();if(JSON.stringify(expected)!==JSON.stringify(actual)){const missing=expected.filter(p=>!actual.includes(p)),extra=actual.filter(p=>!expected.includes(p));fail(`sitemap public-route set mismatch. missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);}console.log(`OK sitemap has exactly ${actual.length} expected public routes`);
for(const auth of AUTH_ONLY)if(paths.includes(auth))fail(`authenticated-only route ${auth} is present in the sitemap`);
const disallows=robotsDisallows(),robots=read("public/robots.txt");if(!/^Allow:\s*\/\s*$/m.test(robots))fail("robots.txt must keep the main crawl allowed (Allow: /)");for(const d of REQUIRED_DISALLOWS)if(!disallows.includes(d))fail(`robots.txt missing required Disallow: ${d}`);for(const d of disallows){if(d==="/")continue;for(const pub of EXPECTED_PUBLIC)if(pub.startsWith(d))fail(`robots.txt Disallow: ${d} is a prefix of public route ${pub}`);}
for(const file of AUTH_ROUTE_FILES)if(!read(file).includes('"noindex, nofollow"'))fail(`${file} is authenticated-only but lacks robots noindex meta`);
for(const pub of EXPECTED_PUBLIC){const file=publicRouteFile(pub);let src:string;try{src=read(file);}catch{fail(`public route ${pub} has no route file at ${file}`);}if(NOINDEX_RE.test(src))fail(`${file} is public but carries noindex/nosnippet/X-Robots-Tag`);}console.log("PASS: sitemap contains only public routes; robots sane; auth pages excluded + noindex; public pages indexable.");}
main();