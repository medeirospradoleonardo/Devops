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

async function init() {
  // const result1 = await (await modifyField(2, 'System.Title', 'Titulo Teste')).json()
  // const result2 = await (await modifyResolution(2, '<h3>Apex Classes: </h3><ul><li>ServiceContractPDFCtrl</li><li>OrderPDFCtrl</li></ul><h3>Visualforce Pages: </h3><ul><li>ServiceContractPDF</li><li>OrderPDF</li></ul>')).json()

  const workItemId = (args?.id)?.toString().replace(/[^0-9]/g, '')
  const newResolutionXML = args?.resolution

  const newResolutionJSON = JSON.parse(convert.xml2json(newResolutionXML.substring(0, newResolutionXML.indexOf('</Package>') + 10), {compact: true, spaces: 4}))
  
  const newResolutionHTML = formatResolutionJSON(newResolutionJSON)
  // console.log(newResolutionHTML)
  const newResolutionHTMLToJSON = JSON.parse(convert.xml2json(newResolutionHTML, {compact: true, spaces: 4}))
  console.log(convert.xml2json(newResolutionHTML, {compact: true, spaces: 4}))
  
  // let result = await (await modifyResolution(workItemId, newRecsolutionHTML)).json()
  
  const workItemReceived = await (await getWorkItem(workItemId, ['Microsoft.VSTS.Common.Resolution'])).json()
  const currentResolution = workItemReceived?.fields['Microsoft.VSTS.Common.Resolution']
  // // const currentResolutionHTML = '<body>' + currentResolution + '</body>'
  const currentResolutionHTML = currentResolution.includes('<body>') ? currentResolution : '<body>' + currentResolution + '</body>'
  
  // const currentResolutionJSON = JSON.parse(convert.xml2json(currentResolutionHTML, {compact: true, spaces: 4}))
  
  console.log(currentResolutionHTML)
  // console.log(currentResolutionJSON)
  // // currentResolutionJSON.body.div = [currentResolutionJSON.body.div]
  // console.log(currentResolutionJSON)
  // // const mergedResolutionJSON = _.defaultsDeep(currentResolutionJSON, newResolutionHTMLToJSON)
  // const mergedResolutionJSON = concatResolutions(currentResolutionJSON, newResolutionHTMLToJSON)
  // console.log(JSON.stringify(mergedResolutionJSON))
  // const mergedResolutionHTML = convert.json2xml(mergedResolutionJSON, {compact: true, spaces: 4})
  // console.log(mergedResolutionHTML)
  
  // result = await (await modifyResolution(workItemId, mergedResolutionHTML)).json()
  // console.log(result)
}

function formatResolutionJSON(resolutionJSON) {
  return '<div automatedGenerated=true>' + resolutionJSON?.Package?.types?.reduce(
    (accumulatorType, currentType) => accumulatorType + '<div>' + (createHeading(currentType?.name?._text) + currentType?.members?.reduce(
      (accumulatorMember, currentMember, index) => accumulatorMember + (createItem(currentMember?._text, index == currentType?.members?.length - 1)), '<ul>'
    )) + '</ul></div>', ''
  ) + '</div>'
}

function createHeading(headingName){
  return `<h3>${headingName.trim()}: </h3>`
}

function createItem(itemName, isLast){
  return `<li>${itemName.trim()}${isLast ? '. ' : '; '}</li>`
}

function concatResolutions(currentResolution, newResolution) {
  const isArray = !!currentResolution?.body?.div?.length
  let automatedGeneratedDiv = isArray ? currentResolution?.body?.div?.find((div) => !!div._attributes?.automatedGenerated) : currentResolution?.body?.div?._attributes?.automatedGenerated

  if(automatedGeneratedDiv){
    automatedGeneratedDiv = {...newResolution}
  }else{
    currentResolution.body.div = currentResolution?.body?.div ? [currentResolution?.body?.div].concat(newResolution?.div) : newResolution?.div
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

const xml = `
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>InformationReportTH</members>
        <members>InformationReportTHTest</members>
        <members>RepresentanteLegalFixtureFactory</members>
        <members>RepresentanteLegalTH</members>
        <members>RepresentanteLegalTHTest</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>InformationReport</members>
        <members>RepresentanteLegal</members>
        <name>ApexTrigger</name>
    </types>
    <version>56.0</version>
</Package><?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <version>56.0</version>
</Package>

`

init()

