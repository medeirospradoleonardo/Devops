const args = require('minimist')(process.argv.slice(2))
const convert = require('xml-js');
const fs = require('node:fs');
require('dotenv').config()

const BASE_URL = process.env.DEV_OPS_BASE_URL
const ORGANIZATION = process.env.DEV_OPS_ORGANIZATION
const PROJECTS = process.env.DEV_OPS_PROJECTS?.split(';').map((project) => project.trim())
const API_VERSION = process.env.DEV_OPS_API_VERSION
const LOGIN = process.env.DEV_OPS_LOGIN
const PASSWORD = process.env.DEV_OPS_PASSWORD
const URL = `https://${BASE_URL}/${ORGANIZATION}/{project}/_apis/wit/workitems/`

const AUTOMATED_LABEL = '=========== Gerado Automaticamente ==========='

async function modifyResolution(workItemId, resolution) {
  return await modifyField(workItemId, 'Microsoft.VSTS.Common.Resolution', resolution)
}

async function getProjectName(workItemId) {
  let project
  for (const projectName of PROJECTS) {
    const workItem = await getWorkItem(workItemId, projectName)

    if (workItem) {
      project = projectName
      break;
    }
  }

  return project
}

async function modifyField(workItemId, field, value) {

  const projectName = await getProjectName(workItemId)
  const url = URL.replace('{project}', projectName) + `${workItemId}?api-version=${API_VERSION}`

  let headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(`${LOGIN}:${PASSWORD}`))
  headers.set('Content-Type', 'application/json-patch+json')

  const request = new Request(url, {
    method: "PATCH",
    body: JSON.stringify(
      [
        {
          op: 'replace',
          path: '/fields/' + field,
          value: value
        }
      ]
    ),
    headers: headers
  })

  return await fetch(request)
}

async function getWorkItem(workItemId, projectName, fields) {
  const url = URL.replace('{project}', projectName) + `${workItemId}?fields=${fields?.join(',')}&api-version=${API_VERSION}`

  let headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(`${LOGIN}:${PASSWORD}`))
  headers.set('Content-Type', 'application/json-patch+json')

  const request = new Request(url, {
    method: "GET",
    headers: headers
  })

  return await fetch(request)
}

function formatResolutionJSON(resolutionJSON) {
  return '<body><div><h2>' + AUTOMATED_LABEL + '</h2>' + resolutionJSON?.Package?.types?.reduce(
    (accumulatorType, currentType) => accumulatorType + '<div>' + (createHeading(currentType?.name?._text) + (currentType?.members?.length ? currentType?.members?.reduce(
      (accumulatorMember, currentMember, index) => accumulatorMember + (createItem(currentMember?._text, index == currentType?.members?.length - 1)), '<ul>'
    ) : '<ul>' + createItem(currentType?.members?._text, true))) + '</ul></div>', ''
  ) + '</div></body>'
}

function createHeading(headingName) {
  return `<h3>${headingName.trim()}: </h3>`
}

function createItem(itemName, isLast) {
  return `<li>${itemName.trim()}${isLast ? '. ' : '; '}</li>`
}

function concatResolutions(currentResolution, newResolution) {
  let automatedGeneratedDivIndex = currentResolution?.body?.div?.findIndex((div) => div?.h2?.length ? div?.h2?.find((h2) => h2._text?.trim() == AUTOMATED_LABEL) : div?.h2?._text?.trim() == AUTOMATED_LABEL)

  if (automatedGeneratedDivIndex >= 0) {
    currentResolution.body.div[automatedGeneratedDivIndex].div = newResolution.body.div.div
  } else {
    currentResolution.body.div = currentResolution?.body?.div ? currentResolution?.body?.div.concat(newResolution?.body?.div) : [newResolution?.body?.div]
  }

  return currentResolution
}

async function runFile(fileName, workItemId, concat) {
  let newResolutionXML

  try {
    newResolutionXML = fs.readFileSync(fileName, 'utf8')
  } catch (err) {
    console.error(err)
  }

  runResolution(newResolutionXML, workItemId, concat)
}

async function runResolution(resolution, workItemId, concat = true) {

  const newResolutionJSON = JSON.parse(convert.xml2json(resolution, { compact: true, spaces: 4 }))
  const newResolutionHTML = formatResolutionJSON(newResolutionJSON)

  //colocando a nova direto
  if (!concat) {
    return await (await modifyResolution(workItemId, newResolutionHTML)).json()
  }

  //Dando upsert
  const projectName = await getProjectName(workItemId)
  const workItemReceived = await (await getWorkItem(workItemId, projectName, ['Microsoft.VSTS.Common.Resolution'])).json()
  let currentResolution = workItemReceived?.fields['Microsoft.VSTS.Common.Resolution']
  currentResolution = currentResolution.replace(/<([A-z]+)([^>^/]*)>\s*<\/\1>/gim, '').replaceAll('<br>', '')

  const currentResolutionHTML = (currentResolution.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>')

  const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, { compact: true, spaces: 4 }))

  currentResolutionJSON.body.div = currentResolutionJSON.body.div ? (currentResolutionJSON.body?.div?.length ? currentResolutionJSON.body.div : [currentResolutionJSON.body.div]) : []
  const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, { compact: true, spaces: 4 }))

  const mergedResolutionJSON = concatResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
  const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, { compact: true, spaces: 4 })

  return await (await modifyResolution(workItemId, mergedResolutionHTML)).json()
}

async function init() {
  const workItemId = (args?.id)?.toString().replace(/[^0-9]/g, '')
  const fileName = (args?.fileName)?.toString()
  const resolution = (args?.resolution)?.toString()

  fileName && runFile(fileName, workItemId, false)
  resolution && runResolution(resolution, workItemId)

}

init()

