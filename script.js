/* globals Chart, randomColor, SlimSelect */

/*
================================================================================
GLOBALS
================================================================================
*/

const baseUrl = 'https://2019-stackoverflow-datasette.glitch.me/csv-data-5d5b425';
let topicChart;


/*
================================================================================
MAIN
================================================================================
*/

// Initialize globals and the "Slim Select" dropdowns
const demographics = [
  createDemographic('Sexuality', '#sexuality'),
  createDemographic('Trans', '#trans'),
  createDemographic('Ethnicity', '#ethnicity'),
  createDemographic('Gender', '#gender'),
  createDemographic('Dependents', '#dependents'),
];
const topicSelection = new SlimSelect({ select: '#topic' });

const askButton = document.getElementById('ask');
askButton.addEventListener('click', onClickAskButton);


/*
================================================================================
HELPERS: Event handlers
================================================================================
*/

async function onClickAskButton(event) {
  // Destroy the old chart to make way for the new one and clear the sample-size string.
  if (topicChart) { topicChart.destroy(); }
  const sampleSizeString = document.getElementById('sample-size');
  sampleSizeString.innerHTML = '';

  // Show the spinner because we're loading results.
  toggleLoadingIndicator();
  
  const chartData = await getChartData();
  
  // Get rid of the spinner when we're ready to display the results.
  toggleLoadingIndicator();
  
  drawChart(chartData);
}


/*
================================================================================
HELPERS: Data-related functions
================================================================================
*/

function createDemographic(name, dropdownCssSelector) {
  return {
    slimSelect: new SlimSelect({ select: dropdownCssSelector }),
    name
  };
} 

async function getChartData() {
  // Fetch the data.
  const selectedTopic = topicSelection.selected();
  const sampleData = await fetchData(selectedTopic, getSelectedClause());  // Get the demographic group data
  const populationData = await fetchData(selectedTopic, '');               // Get the population data
  
  const sampleSize = getGroupSize(sampleData);
  const populationSize = getGroupSize(populationData);
  
  const histogram = buildHistogram(sampleData, populationData);
  
  // Get the values and the counts into separate arrays.
  const labels = Object.keys(histogram);
  const dataCounts = Object.values(histogram);
  const sampleCounts = dataCounts.map(row => row.sampleCount ? row.sampleCount : 0);
  const populationCounts = dataCounts.map(row => row.populationCount ? row.populationCount : 0);
  
  return {
    labels,
    sampleCounts,
    sampleSize,
    populationCounts,
    populationSize
  };
}

async function fetchData(topic, clause) {
  const urlString = `${baseUrl}/results.json?_facet=${topic}${clause}`;  
  const response = await fetch(urlString);
  const json = await response.json();
  return json.facet_results[topic].results;
}

function getSelectedClause() {
  const clauseParts = [];
  for (const demographic of demographics) {
    const selectorValue = demographic.slimSelect.selected();
    if (selectorValue === '') {
      continue;
    }
    const value = encodeURIComponent(selectorValue);
    const clause = `&${demographic.name}__exact=${value}`;
    clauseParts.push(clause);
  }
  return clauseParts.join('');
}

function getGroupSize(data) {
  let accumulator = 0;
  
  data.forEach(row => {
    accumulator += row.count;
  });
               
  return accumulator;
}

/* The buildHistogram() function needs to do the following things:
 *
 * 1. Make sure it collects all labels for the graph, where labels are the
 *    answers chosen by the respondent;
 * 2. For each label, collect the number of respondents in the sample group;
 * 3. For each label, collect the number of respondents in the full population.
 * 
 * Complicating this task are a couple of scenarios:
 *
 * - It's possible that there are labels included in one dataset (i.e., sample
 *   group) that are not included in the other (i.e., population).
 * - It's possible that the labels are in fact a combination of labels, as in the
 *   case of multiple-choice questions. These must be split into unique labels,
 *   and are separated by a semi-colon (';').
 * - In the case of multiple-choice questions, it's likely that as we parse the
 *   the dataset we'll come across the same entry more than once.
 */
function buildHistogram(sampleData, populationData) {
  /* We return a surveyData object that looks like
   * {
   *   'Label 1': {
   *     sampleCount: Number,
   *     populationCount: Number
   *   },
   *   'Label 2': {
   *     sampleCount: Number,
   *     populationCount: Number
   *   }
   * }
   */  
  
  const surveyData = new Object();
  const labelSet = new Set();
    
  // First, we'll process the dataset from the sample group.
  sampleData.forEach(row => {
    // If labels are from multiple-choice questions, the combination needs to be split:
    // 'Label one;Label two;Label three' ~> ['Label one', 'Label two', 'Label three']
    const labels = row.label.split(';');
    
    labels.forEach(label => {
      // We naïvely try adding each label to the set, and if it's a duplicate then
      // the set ignores it. Yay sets!
      labelSet.add(label);
      
      // Check to see if the surveyData object already has the label property; if it
      // does, increment the value for the label's sampleCount property. If it doesn't,
      // we create the object and assign its sampleCount property to the current value.
      if (surveyData[label]) {
        surveyData[label].sampleCount += row.count;
      }
      else {
        surveyData[label] = new Object();
        surveyData[label].sampleCount = row.count;
      }
    });
  });
  
  // Then we run through the population group, because it may include additional
  // labels that weren't in the sample group (and vice-versa).
  populationData.forEach(row => {
    // If labels are from multiple-choice questions, the combination needs to be split:
    // 'Label one;Label two;Label three' ~> ['Label one', 'Label two', 'Label three']
    const labels = row.label.split(';');
    
    labels.forEach(label => {
      // We naïvely try adding each label to the set, and if it's a duplicate then
      // the set ignores it. Yay sets!
      labelSet.add(label);
      
      // Check to see if the surveyData object already has the label property; if it
      // does, we then check to see if it already has the populationCount property (it might
      // only have sampleCount on the first run) and increment its value. If it doesn't,
      // we define the populationCount property and set it to the current value. If the
      // label property doesn't yet exist, we create the object and assign its populationCount
      // property to the current value.
      if (surveyData[label]) {
        if (surveyData[label].populationCount) {
          surveyData[label].populationCount += row.count;
        }
        else {
          Object.defineProperty(surveyData[label], 'populationCount', {
            value: row.count,
            writable: true
          });
        }
      }
      else {
        surveyData[label] = new Object();
        surveyData[label].populationCount = row.count;
      }
    });
  });
  
  return surveyData;
}


/*
================================================================================
HELPERS: Rendering-related functions
================================================================================
*/

function getPercentage(count, total) {
  return 100 * count / total;
}

function drawChart(chartData) {
  const { labels, sampleCounts, sampleSize, populationCounts, populationSize } = chartData;
  
  const sampleSizeString = document.getElementById('sample-size');
  
  sampleSizeString.innerHTML = generateSampleSizeText(sampleSize, populationSize);
  
  // Don't load the chart if there's no data to load.
  if (sampleSize === 0) {
    return;
  }

  const color = randomColor({ luminosity: 'dark', format: 'rgba', alpha: '1.0' });
  const paleColor = color.replace('1.0)', '0.5)');
  const veryPaleColor = color.replace('1.0)', '0.15)');

  const canvasContext = document.getElementById('chart').getContext('2d');

  // Show the chart
  topicChart = new Chart(canvasContext, {
    type: 'horizontalBar',
    data: {
      labels: labels,
      datasets: [{
        data: sampleCounts.map(count => getPercentage(count, sampleSize)),
        backgroundColor: paleColor,
        borderColor: color,
        borderWidth: 1,
        label: 'Selected Group'
      },
      {
        data: populationCounts.map(count => getPercentage(count, populationSize)),
        backgroundColor: veryPaleColor,
        borderColor: paleColor,
        borderWidth: 1,
        label: 'All Respondents'
      }]
    },
    options: {
      tooltips: {
        callbacks: {
          label: function(tooltipItem, data) {
            var label = data.datasets[tooltipItem.datasetIndex].label || '';
            if (label) {
              label += ': ';
            }
            label += Math.round(tooltipItem.xLabel * 10) / 10;
            label += '%';
            return label;
          }
        }
      },
      scales: {
        xAxes: [{
          ticks: {
            min: 0,
            callback: (value, index, values) => { return value + '%'; } // Absolutely have to include all arguments here!
          }
        }]
      }
    }
  });
}

function toggleLoadingIndicator() {
  // The loader animation is from https://github.com/tobiasahlin/SpinKit
  const spinnerDiv = document.querySelector('.spinner');
  const chartContainer = document.querySelector('.chart-container');
  
  if (spinnerDiv) {
    const bounce1Div = document.querySelector('.double-bounce1');
    const bounce2Div = document.querySelector('.double-bounce2');
    bounce1Div.remove();
    bounce2Div.remove();
    spinnerDiv.remove();
  } else {
    const spinnerDiv = document.createElement('div');
    const bounce1Div = document.createElement('div');
    const bounce2Div = document.createElement('div');
    spinnerDiv.classList.add('spinner');
    bounce1Div.classList.add('double-bounce1');
    bounce2Div.classList.add('double-bounce2');
    spinnerDiv.appendChild(bounce1Div);
    spinnerDiv.appendChild(bounce2Div);
    chartContainer.appendChild(spinnerDiv);
  }
}

function generateSampleSizeText(sampleSize, populationSize) {
  const inviteToResearchString = 'Stack Overflow would love to have you participate! Opt-in to next year\'s survey by enabling "Research" in your account settings <a alt="Stack Overflow user settings" href="https://stackoverflow.com/users/email/settings/">here</a>.';
  
  if (sampleSize === 0) {
    return 'Unfortunately, the survey results don\'t yet represent everyone; there\'s no data for the current selection.<br><br>' + inviteToResearchString;
  }
  
  return `Here's what this group of ${sampleSize} people (out of ${populationSize} total respondents) had to say.`;
}