import { A11yReporter } from './../..'
import 'cypress-axe'

A11yReporter.setupCypress()

it('does a thing', () => {
  cy.visit('http://twitter.com/')
  cy.reportA11y()
})
