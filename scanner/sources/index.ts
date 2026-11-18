import sgCard from "./sg-card-show.ts";
import afa from "./afa.ts";
import sgcc from "./sgcc.ts";
import bandai from "./bandai.ts";
import magic from "./magic.ts";
import supanova from "./supanova.ts";
import oz from "./oz-comic-con.ts";
import jump from "./jump-festa.ts";
import expo from "./sg-expo.ts";
import suntec from "./suntec.ts";
import hkcec from "./hkcec.ts";

// Organiser listings own a new record when a venue reports it in the same scan.
export const sources = [
  sgCard,
  afa,
  sgcc,
  bandai,
  magic,
  supanova,
  oz,
  jump,
  expo,
  suntec,
  hkcec,
];
