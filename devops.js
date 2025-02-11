const BASE_URL = 'dev.azure.com'
const ORGANIZATION = 'l30'
const PROJECT = 'l30'
const API_VERSION = '7.2-preview'
const LOGIN = 'basic'
const PASSWORD = '54zaKAiLRTnWqmWqNok1PmxP5QZcdduVnf3rdDNKzTuasjbQe3yXJQQJ99BAACAAAAAAAAAAAAASAZDOcztX'
const URL = `https://${BASE_URL}/${ORGANIZATION}/${PROJECT}/_apis/wit/workitems/`

const AUTOMATED_LABEL = 'Gerado Automaticamente'

const args = require('minimist')(process.argv.slice(2))
const convert = require('xml-js');
const fs = require('node:fs');

async function modifyResolution(workItemId, resolution) {
  return await modifyField(workItemId, 'Microsoft.VSTS.Common.Resolution', resolution)
}

async function modifyField(workItemId, field, value) {

  const url = URL + `${workItemId}?api-version=${API_VERSION}`

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

async function getWorkItem(workItemId, fields){
  const url = URL + `${workItemId}?fields=${fields.join(',')}&api-version=${API_VERSION}`

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
    (accumulatorType, currentType) => accumulatorType + '<div>' + (createHeading(currentType?.name?._text) + currentType?.members?.reduce(
      (accumulatorMember, currentMember, index) => accumulatorMember + (createItem(currentMember?._text, index == currentType?.members?.length - 1)), '<ul>'
    )) + '</ul></div>', ''
  ) + '</div></body>'
}

function createHeading(headingName){
  return `<h3>${headingName.trim()}: </h3>`
}

function createItem(itemName, isLast){
  return `<li>${itemName.trim()}${isLast ? '. ' : '; '}</li>`
}

function concatResolutions(currentResolution, newResolution) {
  let automatedGeneratedDivIndex = currentResolution?.body?.div?.findIndex((div) => div?.h2?.length ? div?.h2?.find((h2) => h2._text?.trim() == AUTOMATED_LABEL) : div?.h2?._text?.trim() == AUTOMATED_LABEL)
  
  if(automatedGeneratedDivIndex >= 0){
    currentResolution.body.div[automatedGeneratedDivIndex].div = newResolution.body.div.div
  }else{
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

  const newResolutionJSON = JSON.parse(convert.xml2json(resolution, {compact: true, spaces: 4}))
  const newResolutionHTML = formatResolutionJSON(newResolutionJSON)
  
  //colocando a nova direto
  if(!concat){
    return await (await modifyResolution(workItemId, newResolutionHTML)).json()
  } 
  
  //Dando upsert
  const workItemReceived = await (await getWorkItem(workItemId, ['Microsoft.VSTS.Common.Resolution'])).json()
  let currentResolution = workItemReceived?.fields['Microsoft.VSTS.Common.Resolution']
  currentResolution = currentResolution.replace(/<([A-z]+)([^>^/]*)>\s*<\/\1>/gim, '').replaceAll('<br>', '')
  
  const currentResolutionHTML = (currentResolution.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>')
  console.log(currentResolutionHTML)

  const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, {compact: true, spaces: 4}))
  
  currentResolutionJSON.body.div = currentResolutionJSON.body.div ? (currentResolutionJSON.body?.div?.length ? currentResolutionJSON.body.div : [currentResolutionJSON.body.div]) : []
  const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, {compact: true, spaces: 4}))
  
  const mergedResolutionJSON = concatResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
  const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, {compact: true, spaces: 4})
  
  return await (await modifyResolution(workItemId, mergedResolutionHTML)).json()
}

async function init() {
  const workItemId = (args?.id)?.toString().replace(/[^0-9]/g, '')
  const fileName = (args?.fileName)?.toString()
  const resolution = (args?.resolution)?.toString()

  fileName && runFile(fileName, workItemId)
  resolution && runResolution(resolution, workItemId)
  
}

init()

