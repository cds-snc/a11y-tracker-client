// reusable xhr for both node and browser contexts
// this allows this library to be used with axe-core from
// node as well as cypress-axe in the browser.
const XHR = typeof XMLHttpRequest === 'undefined'
          ? (require)('xmlhttprequest').XMLHttpRequest
          : XMLHttpRequest

const axe = require('axe-core')

// ============= util functions ============== /

// chomp off a trailing character if it's at the end
const chomp = (str, ch) => {
  if (!str) return str
  if (str[str.length - 1] === ch) return str.slice(0, -1)
  else return str
}

// pluralize an english word according to a number (can pass a
// custom plural form for irregular words)
const plural = (num, single, multiple) => {
  if (!multiple) multiple = `${single}s`
  return num === 1 ? single : multiple
}

// post using xhr, compatible with `await`. if the uri is blank,
// we log the information to the console instead. this is an expected
// situation, for example, when running tests locally it's important
// to not post actual data.
const post = (uri, data) => {
  return new Promise((resolve, reject) => {
    if (!uri) {
      console.warn('a11y-tracker URI is blank. would have posted:')
      console.warn(data)
      return resolve({})
    }

    const xhr = new XHR()

    xhr.onload = () => {
      // check for 2xx
      if (Math.floor(xhr.status / 100) === 2) resolve(xhr.body)
      else reject(xhr)
    }

    // third argument to xhr.open is *always* true - otherwise the whole program
    // or browser will block!
    xhr.open('POST', uri, true);
    xhr.setRequestHeader('content-type', 'application/json')
    xhr.send(JSON.stringify(data))
  })
}

// @public
// If using axe-core directly (not through cypress), this class can be used
// directly to post data to the tracker.
//
// example:
//
// // configure global options (ideally from env variables)
// A11yReporter.configure({
//   revision: '1234567890abcdef', // e.g. the current git hash
//   trackerURI: 'http://url-for.a11y-tracking.service/' // where to find the service
// })
//
// // create a reporter with the page name and description of the state
// const reporter = new A11yReporter('/some/url', 'personal page error state')
//
// // ... run axe-core in whatever way is appropriate for the app ... //
//
// // pass in the final Result object
// await reporter.report(axeResult)
//
class A11yReporter {
  constructor(page, scanName, opts={}) {
    this.page = page
    this.scanName = scanName

    this.revision = opts.revision || A11yReporter.revision
    this.project = opts.project || A11yReporter.project
    this.key = opts.key || A11yReporter.key

    this.trackerURI = chomp(opts.trackerURI || A11yReporter.trackerURI, '/')
  }

  get scanURI() {
    if (!this.trackerURI) return
    else return `${this.trackerURI}/api/v1/scans`
  }

  async report(axeResult) {
    return await post(this.scanURI, {
      revision: this.revision,
      scan_name: this.scanName,
      project_name: this.project,
      key: this.key,
      result: axeResult,
    })
  }
}

// configure the two global options that should be consistent throughout
// the runtime (optional - these could just be passed to the constructor
// instead, but this is often more convenient)
A11yReporter.configure = (opts) => {
  if (opts.trackerURI) A11yReporter.trackerURI = opts.trackerURI
  if (opts.revision) A11yReporter.revision = opts.revision
  if (opts.project) A11yReporter.project = opts.project
  if (opts.key) A11yReporter.key = opts.key
}


// ================ Cypress integration (optional!) ============== //
const getTestNameFromMocha = (mocha) => {
  let runner = mocha.getRunner().currentRunnable
  const out = []

  while (runner) {
    if (runner.title) out.push(runner.title)

    runner = runner.parent
  }

  return out.join('::')
}

// When using through Cypress, use the `setupCypress` function to set up and
// inject the correct functions into the runtime.
//
// Before your tests run (in a global area, not in beforeEach),
// set up the global options for your app:
//
// A11yReporter.setupCypress(cy, {
//   // the location of the a11y tracker service, default $A11Y_REPORTER_URI
//   // if empty, will not post results and instead just log to the console
//   trackerURI: ...
//
//   // default to $A11Y_REPORTER_URI or $GIT_HASH
//   revision: ...,
//
//   ... options for axe.configure(...) ...
// })
//
// Then, at the end of each test, (or in afterEach), run the actual scan/report:
//
// cy.reportA11y({
//   page: ..., // default current window.location
//   name: ..., // default to current test qualified name
//   context: ..., // default to whole document
//
//   ... options for axe.run(context, { ... }) ...
// })
//
A11yReporter.setupCypress = (globalOpts={}) => {
  A11yReporter.configure({
    trackerURI: globalOpts.trackerURI || Cypress.env('A11Y_TRACKER_URI'),
    revision: globalOpts.revision || Cypress.env('A11Y_TRACKER_REVISION') || Cypress.env('GIT_HASH'),
    project: globalOpts.project || Cypress.env('A11Y_TRACKER_PROJECT')
    key: globalOpts.key || Cypress.env('A11Y_TRACKER_KEY'),
  })

  Cypress.Commands.add('reportA11y', (context, opts={}) => {
    let reporter
    let result

    cy.window({ log: false }).then((win) => {
      const page = opts.page || win.location.href
      const scanName = opts.name || getTestNameFromMocha(Cypress.mocha)
      reporter = new A11yReporter(page, scanName)

      // inject the axe runtime into the page and configure it with the options
      // sent to `setupCypress`
      win.eval(axe.source)
      win.axe.configure(globalOpts)

      // run axe, gather the result promise - pop out to
      // another cypress .then to avoid more nesting
      return win.axe.run(opts.context || win.document, opts)
    }).then((_result) => {
      // make sure we have the result available in the higher scope so we can
      // use it later
      result = _result

      // report the results - we don't actually wait for this
      // until the end of this function.
      const reportPromise = reporter.report(result)

      // log the violations, if any
      result.violations.forEach((violation) => {
        const numNodes = violation.nodes.length
        const nodeCount = numNodes === 1 ? '' : ` (${numNodes})`
        const message = `${violation.id}${nodeCount}`
        Cypress.log({
          name: `a11y/${violation.impact}`,
          consoleProps: () => violation,
          message: message,
        })
      })

      // return the report promise, so we make sure to not navigate away
      // while the POST is happening
      return reportPromise
    }).then(() => {
      // assert that there are no violations. we don't do this earlier because
      // it could end the whole run and interrupt the POST.
      const n = result.violations.length
      assert.equal(n, 0, `a11y: ${n} ${plural(n, 'violation')} ${plural(n, 'was', 'were')} detected`)

    })
  })
}


module.exports = {
  A11yReporter,
}
