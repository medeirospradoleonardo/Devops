const BASE_URL = 'dev.azure.com'
const ORGANIZATION = 'l30'
const PROJECT = 'l30'
const API_VERSION = '7.2-preview'
const LOGIN = 'basic'
const PASSWORD = '54zaKAiLRTnWqmWqNok1PmxP5QZcdduVnf3rdDNKzTuasjbQe3yXJQQJ99BAACAAAAAAAAAAAAASAZDOcztX'
const URL = `https://${BASE_URL}/${ORGANIZATION}/${PROJECT}/_apis/wit/workitems/`

const args = require('minimist')(process.argv.slice(2))
const convert = require('xml-js');
const _ = require("lodash");
const { HTMLToJSON } = require('html-to-json-parser');
const {convertXML} = require("simple-xml-to-json")
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
  return '<body><div class=\"automaticallyGenerated\">' + resolutionJSON?.Package?.types?.reduce(
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
  let automatedGeneratedDiv = currentResolution?.body?.div?.find((div) => div?._attributes?.class == 'automaticallyGenerated')
  
  if(automatedGeneratedDiv){
    automatedGeneratedDiv = {...newResolution}
  }else{
    currentResolution.body.div = currentResolution?.body?.div.concat(newResolution?.body?.div)
  }

  return currentResolution
}

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

async function init() {
  const workItemId = (args?.id)?.toString().replace(/[^0-9]/g, '')
  const fileName = (args?.resolution).toString()
  console.log(fileName)
  let newResolutionXML

  try {
    newResolutionXML = fs.readFileSync(fileName, 'utf8')
  } catch (err) {
    console.error(err)
  }

  const newResolutionJSON = JSON.parse(convert.xml2json(newResolutionXML.substring(0, newResolutionXML.indexOf('</Package>') + 10), {compact: true, spaces: 4}))
  // const newResolutionJSON = convertXML(newResolutionXML)
  const newResolutionHTML = formatResolutionJSON(newResolutionJSON)
  
  //colocando a nova direto
  let result = await (await modifyResolution(workItemId, newResolutionHTML)).json()
  
  // Dando upsert
  // const workItemReceived = await (await getWorkItem(workItemId, ['Microsoft.VSTS.Common.Resolution'])).json()
  // const currentResolution = workItemReceived?.fields['Microsoft.VSTS.Common.Resolution']
  // const currentResolutionHTML = (currentResolution.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>').replace('automaticallyGenerated', '\"automaticallyGenerated\"')
  
  // const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, {compact: true, spaces: 4}))
  
  // currentResolutionJSON.body.div = currentResolutionJSON.body?.div?.length ? currentResolutionJSON.body.div : [currentResolutionJSON.body.div]
  // const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, {compact: true, spaces: 4}))
  
  // // const mergedResolutionJSON = _.defaultsDeep(currentResolutionJSON, newResolutionHTMLToJSON)
  // const mergedResolutionJSON = concatResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
  // const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, {compact: true, spaces: 4})
  
  // result = await (await modifyResolution(workItemId, mergedResolutionHTML)).json()
}

init()

