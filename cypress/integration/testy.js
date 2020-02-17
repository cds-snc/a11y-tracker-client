import { A11yReporter } from './../..'
import 'cypress-axe'

A11yReporter.setupCypress()

it('does a thing', () => {
  cy.visit('http://digital.canada.ca/')
  cy.reportA11y()
})
