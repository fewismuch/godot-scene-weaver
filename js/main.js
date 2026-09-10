import { resetHistory } from "./history.js";
import { render } from "./render.js";
import { bindEvents } from "./interaction.js";

bindEvents();
resetHistory();
render();
