import htm from 'htm';
import { Icon, Spinner, cx } from './core.jsx';
import * as actions from './actions.jsx';
import * as forms from './forms.jsx';
import * as layout from './layout.jsx';
import * as data from './data.jsx';
import * as containers from './containers.jsx';
import * as feedback from './feedback.jsx';
import * as people from './people.jsx';

const html = htm.bind(React.createElement);
window.FlockUI = Object.assign({ Icon, Spinner, cx, html }, actions, forms, layout, data, containers, feedback, people);
