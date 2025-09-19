const args = require('minimist')(process.argv.slice(2))
const convert = require('xml-js');
const fs = require('node:fs');
require('dotenv').config()

const ORGANIZATION = process.env.DEVOPS_ORGANIZATION
const API_VERSION = '7.2-preview'
const LOGIN = 'basic'
const URL = `https://dev.azure.com/${ORGANIZATION}/_apis/wit/workitems/`
const RESOLUTION_FIELD = 'Microsoft.VSTS.Common.Resolution'

const TRANSLATE_RESPONSE = {
  200: 'Resolution alterada com sucesso!',
  401: 'Token Expirado',
  404: 'WorkItem não econtrado!'
}

let TOKEN = process.env.DEVOPS_TOKEN_DEFAULT
let tokenByUniqueName = {}

const AUTOMATED_LABEL = '=========== Gerado Automaticamente ==========='

async function modifyResolution(workItemId, resolution) {
  const statusResponse = (await modifyField(workItemId, RESOLUTION_FIELD, resolution))?.status;
  return {
    message: TRANSLATE_RESPONSE[statusResponse],
    status: statusResponse
  }
}

async function getAssignedUserUniqueName(workItemId) {
  const userAssignedToField = 'System.AssignedTo'
  const workItem = JSON.parse(await (await getWorkItem(workItemId, [userAssignedToField])).text())

  if (!workItem) {
    return;
  }

  return workItem?.fields?.[userAssignedToField]?.uniqueName
}

async function modifyField(workItemId, field, value) {

  const url = URL + `${workItemId}?api-version=${API_VERSION}`

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

  return await fetch(request)
}

async function getWorkItem(workItemId, fields) {
  const url = URL + `${workItemId}?api-version=${API_VERSION}${fields ? `&fields=${fields?.join(',')}` : ''}`

  let headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(`${LOGIN}:${TOKEN}`))
  headers.set('Content-Type', 'application/json-patch+json')

  const request = new Request(url, {
    method: "GET",
    headers: headers
  })

  return await fetch(request)
}

function getArray(objectOrArray) {
  return objectOrArray ? (Array.isArray(objectOrArray) ? objectOrArray : [objectOrArray]) : []
}

function formatResolutionJSON(resolutionJSON) {

  const formatedResolution = getArray(resolutionJSON?.Package?.types)
  formatedResolution.sort((a, b) => a?.name?._text.localeCompare(b?.name?._text))

  return '<body><div><h2>' + AUTOMATED_LABEL + '</h2>' + formatedResolution.reduce(
    (accumulatorType, currentType) => accumulatorType + '<div>' + (createHeading(currentType?.name?._text) + (getArray(currentType?.members).reduce(
      (accumulatorMember, currentMember, index) => accumulatorMember + (createItem(currentMember?._text)), '<ul>'
    ))) + '</ul></div>', ''
  ) + '</div></body>'
}

function createHeading(headingName) {
  return `<h3>${headingName.trim()}: </h3>`
}

function createItem(itemName) {
  return `<li>${itemName.trim()}</li>`
}

function getArrayByNameTag(array, nameTag) {
  return array.find((element) => element?.['h3']?._text == nameTag)
}

function mergeArray(a, b, prop) {
  let reduced = [];
  for (let i = 0; i < a.length; i++) {
    let aitem = a[i];
    let found = false;
    for (let ii = 0; ii < b.length; ii++) {
      if (aitem[prop]?.trim() === b[ii][prop]?.trim()) {
        found = true;
        break;
      }
    }
    if (!found) {
      reduced.push(aitem);
    }
  }
  return reduced.concat(b);
}

function mergeResolutions(currentResolution, newResolution) {

  let currentDiv = getArray(getArray(currentResolution.body).find((element) => element?.div?.['h2']?._text?.trim() == AUTOMATED_LABEL.trim())?.div?.div)

  if (!currentDiv.length) {
    currentDiv = getArray(getArray(currentResolution.body).find((element) => element?.['h2']?._text?.trim() == AUTOMATED_LABEL.trim())?.div)

    const currentResolutionDivIndex = getArray(currentResolution.body.div).findIndex((element) => element?.['h2']?._text?.trim() == AUTOMATED_LABEL.trim())

    currentResolution.body.div = getArray(currentResolution.body.div).slice(currentResolutionDivIndex, currentResolutionDivIndex - 1)
  }


  const newDiv = getArray(getArray(newResolution.body).find((element) => element?.div?.['h2']?._text?.trim() == AUTOMATED_LABEL.trim())?.div?.div)

  currentDiv.forEach((element) => {

    let currentArray = getArray(element?.ul?.li)
    const newArray = getArray(getArrayByNameTag(newDiv, element?.['h3']?._text)?.ul?.li)

    if (!currentArray?.length || !newArray?.length) {
      return
    }

    element.ul.li = (mergeArray(currentArray, newArray, '_text'))
    element.ul.li.sort((a, b) => a?._text?.localeCompare(b?._text))
  })

  newDiv.forEach((element) => {

    const newArray = getArray(element?.ul?.li)
    const currentArray = getArray(getArrayByNameTag(currentDiv, element?.['h3']?._text)?.ul?.li)

    if (!newArray?.length || currentArray.length) {
      return
    }

    newArray.sort((a, b) => a._text.localeCompare(b._text))

    element.ul.li = newArray

    currentDiv = currentDiv.concat([element]).sort((a, b) => a._text - b._text)
  })

  newResolution.body.div = {
    ...currentResolution.body.div,
    ...newResolution.body.div,
    div: currentDiv
  }

  newResolution.body.div.div.sort((a, b) => a?.['h3']?._text.localeCompare(b?.['h3']?._text))

  return newResolution
}

async function runFile(fileName, workItemId, format, merge) {
  let newResolutionXML
  let response

  try {
    newResolutionXML = fs.readFileSync(fileName, 'utf8')
    response = await runResolution(newResolutionXML, workItemId, format, merge)
  } catch (error) {
    response = {
      message: error.message,
      status: 500
    }
  }

  return response
}

async function runResolution(resolution, workItemId, format = false, merge = false) {

  try {
    const newResolutionJSON = JSON.parse(convert.xml2json(resolution, { compact: true, spaces: 4 }))
    const newResolutionHTML = formatResolutionJSON(newResolutionJSON)

    //colocando a nova direto
    if (!merge) {
      let resolution = newResolutionHTML

      if (!format) {
        resolution = convert.json2xml(newResolutionJSON, { compact: true, spaces: 4 })
      }

      return modifyResolution(workItemId, resolution)
    }

    // Dando upsert (mergeenando com o que ja tem)
    const workItemResponse = await getWorkItem(workItemId, [RESOLUTION_FIELD])

    if (workItemResponse?.status != 200) {
      return TRANSLATE_RESPONSE[workItemResponse?.status]
    }

    const workItemReceived = JSON.parse(await workItemResponse.text())

    let currentResolution = workItemReceived?.fields[RESOLUTION_FIELD]

    currentResolution = currentResolution?.replace(/<([A-z]+)([^>^/]*)>\s*<\/\1>/gim, '').replaceAll('<br>', '')

    const currentResolutionHTML = (currentResolution?.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>')

    const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, { compact: true, spaces: 4 }))

    const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, { compact: true, spaces: 4 }))

    const mergedResolutionJSON = mergeResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
    const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, { compact: true, spaces: 4 })

    return await modifyResolution(workItemId, mergedResolutionHTML)
  } catch (error) {
    return {
      message: error.message,
      status: 500
    }
  }
}

async function updateTokenWithAssigner() {

  const assignedUserUniqueName = await getAssignedUserUniqueName(workItemId)

  for (envKey in process.env) {
    if (!envKey.includes('DEVOPS_UNIQUE_NAME')) {
      continue;
    }

    const tokenKey = envKey.replace('UNIQUE_NAME', 'TOKEN')

    tokenByUniqueName[process.env[envKey]] = process.env[tokenKey]
  }

  if (tokenByUniqueName[assignedUserUniqueName]) {
    TOKEN = tokenByUniqueName[assignedUserUniqueName]
  }
}

function extractNumber(code) {
  const match = code.match(/\d+/);
  return match ? match[0] : null;
}

async function init() {
  const workItemId = extractNumber(args?.id?.toString())
  const fileName = (args?.fileName)?.toString()
  const resolution = (args?.resolution)?.toString()
  const format = args?.format
  const merge = !args?.override ?? true
  const updateWithAssigner = args?.assignedUpdate ?? false

  let response

  if (!TOKEN) {
    response = 'Token não encontrado!'
    console.log(response)
    process.exit(1)
  }

  if (updateWithAssigner) {
    await updateTokenWithAssigner()
  }

  if (!resolution && fileName) {
    response = await runFile(fileName, workItemId, format, merge)

    console.log(response.message)

    if(response.status == 200){
      return response
    }else{
      process.exit(1)
    }
  }

  if (!fileName && resolution) {
    response = await runResolution(resolution, workItemId, format, merge)

    console.log(response.message)

    if(response.status == 200){
      return response
    }else{
      process.exit(1)
    }
  }

}

init()