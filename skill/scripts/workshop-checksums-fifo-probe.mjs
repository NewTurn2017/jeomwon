import { validateWorkshopChecksumVariants } from "./workshop-checksums.mjs";

const variants = JSON.parse(process.argv[2]);
validateWorkshopChecksumVariants(variants, ["a.txt", "b.json"]);
