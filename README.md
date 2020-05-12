# Installing the JavaScript API client

### Purpose
The purpose of this document is to demonstrate how to install the JavaScript API client as part of your [Cypress.io](https://www.cypress.io/) workflows to enable the upload of that data to the accessibility tracker.

### Installing the client
To install the API client, save the NPM package to your developer dependencies using the following command:

```
npm i @cdssnc/a11y-tracker-client --save-dev`
```


### Getting an API key
Follow the process here  [https://docs.google.com/document/d/144cLAmNSIHANprDIXcL6hvHrUjmyTFBDZbqO-ZdU8R0/edit](https://docs.google.com/document/d/144cLAmNSIHANprDIXcL6hvHrUjmyTFBDZbqO-ZdU8R0/edit) or ask a CDS team member to generate you one.

### Configuring Cypress.io to use the client
The client wrappes the existing accessbility checker integrations with Cypress.io and therefore can be used as a replacement. To integrate the API client add the following code snippet to your `cypress/support/index.js` file:

```
const { A11yReporter } = require ('@cdssnc/a11y-tracker-client');

// default to not reporting
A11yReporter.configure({
  trackerURI: undefined,
  revision: '<local>',
  project: 'my-accessible-project',
});

// if we're in CI and on the master branch, do the actual reporting
if (process.env.NODE_ENV === 'testing' &&
    process.env.GITHUB_REF === 'refs/heads/master') {
  A11yReporter.configure({
    trackerURI: process.env.A11Y_TRACKER_URI || 'https://a11y-tracker.herokuapp.com/',
    revision: process.env.GITHUB_GIT_HASH,
    key: process.env.A11Y_TRACKER_KEY,
    project: 'my-accessible-project',
  });
}

A11yReporter.setupCypress();
```

Important to note here is that this code snippet will only send code to the accessibility tracker API if your `process.env.NODE_ENV === 'testing'` and `process.env.GITHUB_REF === 'refs/heads/master'`. This would be the case for example if you are running this code in your continous integrartion pipeline on [GitHub Actions](https://github.com/features/actions) using the following configuration as an example:

```
- name: Run Cypress end-to-end
        uses: cypress-io/github-action@v1
        env:
          NODE_ENV: testing
          A11Y_TRACKER_KEY: ${{ secrets.A11Y_TRACKER_KEY }}
        with:
          install: false
          start: npm run start:test
```

### Running tests

To actually run tests you need to include the `cy.reportA11y();` as part of your tests. For example you can run them in individual tests:
```
it('loads the login screen', () => {
    cy.visit('/en/login');
    cy.get('h1').contains('Login');
    cy.reportA11y();
  });
  ```
  
 Or inside a `beforeEach`:
 
 ```
 beforeEach(() => {	
    cy.reportA11y();
  })

 ```
 
 ### Validating that information is being sent
 
 The API client will log errors if you are not able to connect to the API. If you are running the client locally, you will also see it working locally without writing to the API. However, the difference between writing to the API and not writing to the API is the presence of `trackerURI`, `key`, and `project` in the `A11yReporter.configure` function.