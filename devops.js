const args = require('minimist')(process.argv.slice(2))
const convert = require('xml-js');
const fs = require('node:fs');
require('dotenv').config()

const BASE_URL = process.env.DEV_OPS_BASE_URL
const ORGANIZATION = process.env.DEV_OPS_ORGANIZATION
const PROJECTS = process.env.DEV_OPS_PROJECTS?.split(';').map((project) => project.trim())
const API_VERSION = process.env.DEV_OPS_API_VERSION
const LOGIN = process.env.DEV_OPS_LOGIN
const URL = `https://${BASE_URL}/${ORGANIZATION}/{project}/_apis/wit/workitems/`

let TOKEN = process.env.DEV_OPS_TOKEN_DEFAULT
let projectName = PROJECTS?.[0]
let tokenByUniqueName = {}

const AUTOMATED_LABEL = '=========== Gerado Automaticamente ==========='

async function modifyResolution(workItemId, resolution) {
  return await modifyField(workItemId, 'Microsoft.VSTS.Common.Resolution', resolution)
}

async function getProjectName(workItemId) {
  let project
  for (const projectName of PROJECTS) {
    const workItem = await getWorkItem(workItemId)

    if (workItem) {
      project = projectName
      break;
    }
  }

  return project
}

async function getAssignedUserUniqueName(workItemId) {
  const userAssignedToField = 'System.AssignedTo'
  const workItem = await getWorkItem(workItemId, [userAssignedToField])

  if (!workItem) {
    return;
  }


  return workItem?.fields?.[userAssignedToField]?.uniqueName
}

async function modifyField(workItemId, field, value) {

  const url = URL.replace('{project}', projectName) + `${workItemId}?api-version=${API_VERSION}`

  let headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(`${LOGIN}:${TOKEN}`))
  headers.set('Content-Type', 'application/json-patch+json')

  const request = new Request(url, {
    method: "PATCH",
    body: JSON.stringify(
      [
        {
          op: 'replace',
          path: '/fields/' + field,
          value: value,
          type: 'Plaintext'
        }
      ]
    ),
    headers: headers
  })

  const response = await fetch(request)

  const responseString = await response.text()
  return responseString === '' ? {} : JSON.parse(responseString)
}

async function getWorkItem(workItemId, fields) {
  const url = URL.replace('{project}', projectName) + `${workItemId}?fields=${fields?.join(',')}&api-version=${API_VERSION}`

  let headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(`${LOGIN}:${TOKEN}`))
  headers.set('Content-Type', 'application/json-patch+json')

  const request = new Request(url, {
    method: "GET",
    headers: headers
  })

  const response = await fetch(request)

  const responseString = await response.text()
  return responseString === '' ? {} : JSON.parse(responseString)
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

async function runFile(fileName, workItemId, format, concat) {
  let newResolutionXML

  try {
    newResolutionXML = fs.readFileSync(fileName, 'utf8')
  } catch (err) {
    console.error(err)
    return
  }

  runResolution(newResolutionXML, workItemId, format, concat)
}

async function runResolution(resolution, workItemId, format = false, concat = false) {

  const newResolutionJSON = JSON.parse(convert.xml2json(resolution, { compact: true, spaces: 4 }))
  const newResolutionHTML = formatResolutionJSON(newResolutionJSON)

  //colocando a nova direto
  if (!concat) {
    let resolution = newResolutionHTML

    if (!format) {
      const mergedResolutionHTML = convert.json2xml(newResolutionJSON, { compact: true, spaces: 4 })
      resolution = mergedResolutionHTML
    }

    return await modifyResolution(workItemId, resolution)
  }

  // Dando upsert (concatenando com o que ja tem, só trocando a parte gerada automaticamente)
  const workItemReceived = await getWorkItem(workItemId, ['Microsoft.VSTS.Common.Resolution'])
  let currentResolution = workItemReceived?.fields['Microsoft.VSTS.Common.Resolution']
  currentResolution = currentResolution.replace(/<([A-z]+)([^>^/]*)>\s*<\/\1>/gim, '').replaceAll('<br>', '')

  const currentResolutionHTML = (currentResolution.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>')

  const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, { compact: true, spaces: 4 }))

  currentResolutionJSON.body.div = currentResolutionJSON.body.div ? (currentResolutionJSON.body?.div?.length ? currentResolutionJSON.body.div : [currentResolutionJSON.body.div]) : []
  const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, { compact: true, spaces: 4 }))

  const mergedResolutionJSON = concatResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
  const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, { compact: true, spaces: 4 })

  return await modifyResolution(workItemId, mergedResolutionHTML)
}

async function updateTokenWithAssigner() {

  const assignedUserUniqueName = await getAssignedUserUniqueName(workItemId)

  for (envKey in process.env) {
    if (!envKey.includes('DEV_OPS_UNIQUE_NAME')) {
      continue;
    }

    const tokenKey = envKey.replace('UNIQUE_NAME', 'TOKEN')

    tokenByUniqueName[process.env[envKey]] = process.env[tokenKey]
  }

  if (tokenByUniqueName[assignedUserUniqueName]) {
    TOKEN = tokenByUniqueName[assignedUserUniqueName]
  }
}

async function init() {
  const workItemId = (args?.id)?.toString().replace(/[^0-9]/g, '')
  const fileName = (args?.fileName)?.toString()
  const resolution = (args?.resolution)?.toString()
  const format = args?.format
  const updateWithAssigner = args?.assignedUpdate ?? false

  projectName = await getProjectName(workItemId)

  if (!projectName) {
    console.log('Projeto não econtrado!')
    return 'Projeto não econtrado!'
  }


  if (updateWithAssigner) {
    await updateTokenWithAssigner()
  }

  if (!TOKEN) {
    console.log('Token não encontrado!')
    return 'Token não encontrado!'
  }

  fileName && runFile(fileName, workItemId, format)
  resolution && runResolution(resolution, workItemId, format)


  console.log('Resolution alterada!')
  return 'Resolution alterada!'
}

init()

