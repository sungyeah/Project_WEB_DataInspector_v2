var highLightValues = [];

document.addEventListener('DOMContentLoaded', () => {
  const highLight = document.getElementById("highlight_parameter");
  const highLightList = document.querySelector(".highLight-list");

  highLightList.addEventListener("click", deleteParam);
  highLight.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && highLight.value.trim() !== "") {
      const value = highLight.value;
      if (!highLightValues.includes(value)) {
        highLightValues.push(value);
        highLightList.insertAdjacentHTML(
          "beforeend",
          `
          <div class="high-light">
            <div class="parameter-name">${value}</div>
            <div class="cancel">&times;</div>
          </div>
        `
        );
      }
      updateHighlight();
      highLight.value = "";
    }
  });
});

function deleteParam(e) {
  if (e.target.className == "cancel") {
    const paramName = e.target.previousElementSibling.textContent;
    highLightValues = highLightValues.filter((value) => value !== paramName);
    e.target.parentElement.remove();
    updateHighlight();
  }
}

function updateHighlight() {
  var tdList = document.querySelectorAll("#epTbody > tr > td:nth-child(1), #upTbody > tr > td:nth-child(1)")
  tdList.forEach(td => {
    if (highLightValues.includes(td.textContent)) {
      td.parentElement.classList.add("hl");   // 배열에 있으면 hl 클래스 추가
    } else {
      td.parentElement.classList.remove("hl"); // 배열에서 제거되면 hl 클래스 제거
    }
  });
}

function setData(bundle, platform) {
  const copyClass = document.querySelector('.copyImg');
  copyClass.className = 'copyImg';
  convertJsoniOS(bundle, platform);
  createFilterList();
  viewList();
}

// 필터 list 생성 함수
function createFilterList() {
  const ul = document.querySelector('ul');
  const isChecked = document.querySelector('.view');
  const eventNameSet = new Set(eventArr.map(i => i.eventName));
  const existingEventNames = new Set([...ul.children].map(li => li.querySelector('input')?.value));
  const missingEventNames = new Set([...eventNameSet].filter(eventName => !existingEventNames.has(eventName)));

  function createCheckboxHTML(eventName) {
    return `
      <li>
        <div class="checkbox-wrapper-4">
          <input class="inp-cbx" id="${eventName}" name="filter" type="checkbox" value="${eventName}" ${isChecked ? '' : 'checked'}/>
          <label class="cbx" for="${eventName}">
            <span><svg width="12px" height="10px"><use xlink:href="#check-4"></use></svg></span>
            <span>${eventName}</span>
          </label>
          <svg class="inline-svg">
            <symbol id="check-4" viewbox="0 0 12 10">
              <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
            </symbol>
          </svg>
        </div>
      </li>`;
  }

  if (ul.children.length === 1) {
    ul.replaceChildren()
    eventNameSet.forEach(eventName => {
      ul.insertAdjacentHTML('beforeend', createCheckboxHTML(eventName));
    });
  } else {
    missingEventNames.forEach(eventName => {
      ul.insertAdjacentHTML('beforeend', createCheckboxHTML(eventName));
    });
  }
}

// 필터 영역 내 apply버튼 클릭시 class명 추가
function toggle() {
  const checkedEvent = document.querySelectorAll('input[name="filter"]:checked');
  if (checkedEvent.length > 0) {
    document.querySelector('.eventList').classList.add('view');
    closeFilter();
    viewList();
  } else {
    alert('1개 이상 선택해야 합니다.');
  }
}

function openFilter() {
  const filterArea = document.querySelector('.filterArea > div');
  filterArea.classList.remove('remove');
  modal_background.style.display = 'block';
}

function closeFilter() {
  const filterArea2 = document.querySelector('.filterArea > div');
  filterArea2.classList.add('remove');
  modal_background.style.display = 'none';
}

// 변환 후 이벤트 리스트를 출력해주는 함수
function viewList() {
  const eventTag = document.getElementById('eventList');
  const filterEvent = document.querySelectorAll('input[name="filter"]:checked');
  let eventNo = 1;
  const checkedEvent = new Set();
  filterEvent.forEach((e)=> {
    checkedEvent.add(e.value);
  })
  eventTag.replaceChildren();
  for (i in eventArr) {
    const event = eventArr[i]
    if(checkedEvent.has(event.eventName)) {
      const timestamp = Number(event.remainDatas.start_timestamp_millis);
      const nineHoursInMillis = 9 * 60 * 60 * 1000;
      // 9시간을 더한 timestamp
      const timestampWithNineHours = timestamp + nineHoursInMillis;
      const formattedDate = timestampWithNineHours ? new Date(timestampWithNineHours).toISOString().replace('T', ' ').substring(0, 19) : '';
      const eventName = event.eventName == 'error_code' ? 'firebase_error' : eventArr[i].eventName;
      const eventSummaryClass = event.eventParams.error_code ? 'error' : '';
      const platform = event.platform;
  
      eventTag.insertAdjacentHTML(
        'beforeend',
        `<div class="eventSummary ${eventSummaryClass}" onclick="viewEvent(${i}, this)">
          <div class="evnetNo">${eventNo}</div>
          <div class="${platform}Background">
            <i class="${platform}Icon">plat_${platform}</i>
          </div>
          <div class="eventName">${eventName}</div>
          <div class="time">${formattedDate}</div>
        </div>`
      );
      eventNo++
    }
  }
}

// 발생한 이벤트 데이터 출력해주는 함수
function viewEvent(no, clickDiv) {
  const copyClass = document.querySelector('.copyImg');
  const viewEvent = eventArr[no];
  const platform = viewEvent.platform;
  clearTableContents();
  if (viewEvent.eventParams) {
    const epTbody = document.getElementById('epTbody');
    insertData(platform, viewEvent.eventParams, epTbody);
  }

  // 사용자 속성 출력
  if (Object.keys(viewEvent.userProperties).length > 0) {
    const upTbody = document.getElementById('upTbody');
    const upImg = document.getElementById('upImg');
    insertData(platform, viewEvent.userProperties, upTbody);
    upImg.className = 'dropDown';
  }

  // 거래 데이터 출력
  if (viewEvent.eventParams.transactions) {
    const transactionTbody = document.getElementById('transactionTbody');
    const transImg = document.getElementById('transImg');
    insertData(platform, viewEvent.eventParams.transactions, transactionTbody);
    transImg.className = 'dropDown';
  }

  // 상품 데이터 출력
  if (viewEvent.eventParams.items) {
    const items = viewEvent.eventParams.items;
    const itemImg = document.getElementById('itemImg');
    const itemsTbody = document.getElementById('itemsTbody');
    for (i in items) {
      insertData(platform, items[i], itemsTbody, i);
    }
    itemImg.className = 'dropDown';
  }

  // 기타 데이터 출력
  if (Object.keys(viewEvent.remainDatas).length > 0) {
    const remainTbody = document.getElementById('remainTbody');
    const remainImg = document.getElementById('remainImg');
    insertData(platform, viewEvent.remainDatas, remainTbody);
    remainImg.className = 'dropDown up';
  }

  // 클릭 시 배경색 입히기
  const divs = document.querySelectorAll('.eventSummary');
  divs.forEach((div) => div.classList.remove('selected'));

  clickDiv.classList.add('selected');
  copyClass.className = 'copyImg';
}

// 데이터를 HTML요소 추가해주는 함수
function insertData(platform, data, tbody, i) {  
  const blockList = ['event_name', 'items', 'transactions', 'firebase_screen_name', 'firebase_screen_class', '_ltv_KRW', '_mst', '_pi'];
  const remainList = ['firebase_screen_id', '_c', 'realtime', 'ga_debug', 'firebase_event_origin', '_fi', '_fot', '_sid', '_sid', '_sno', '_lte', '_se', 'engagement_time_msec', '_ltv_KRW', '_mst', '_pi'];
  const isItem = i ? 'item' + (Number(i) + 1) + '.' : '';
  // const platform = 

  // 화면 정보 설정(screen_name/screen_class)
  if (tbody == document.getElementById('epTbody')) {
    // event_name 설정
    const eventNameValue = data.event_name ? data.event_name : 'Error: 값이 없습니다.';
    const eventNameValueType = typeof eventNameValue == 'string' ? 'str' : 'num';
    createTr(platform, 'event_name', eventNameValue, eventNameValueType, tbody, isItem);

    // screen_name 설정
    const screenNameValue = data.firebase_screen_name ? data.firebase_screen_name : 'Error: 값이 없습니다.';
    const screenNameValueType = typeof screenNameValue == 'string' ? 'str' : 'num';
    createTr(platform, 'firebase_screen_name', screenNameValue, screenNameValueType, tbody, isItem);

    // screen_class 설정
    const screenClassValue = data.firebase_screen_class ? data.firebase_screen_class : 'Error: 값이 없습니다.';
    const screenClassValueType = typeof screenClassValue == 'string' ? 'str' : 'num';
    createTr(platform, 'firebase_screen_class', screenClassValue, screenClassValueType, tbody, isItem);
  }

  // 상품 정보 설정
  if (tbody == document.getElementById('itemsTbody')) {
    let item = { ...data };
    const itemList = ['item_id', 'item_name', 'item_brand', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_variant', 'price', 'quantity', 'coupon', 'discount', 'item_list_id', 'item_list_name', 'index', 'location_id', 'affiliation', 'currency'];

    // item 추천 항목 설정
    for (let key of itemList) {
      if (item[key]) {
        const value = item[key];
        const valueType = typeof value == 'string' ? 'str' : 'num';
        createTr(platform, key, value, valueType, tbody, isItem);
        delete item[key];
      }
    }

    // 맞춤 항목 범위 설정
    for (const key in item) {
      if (!blockList.includes(key)) {
        const value = item[key];
        const valueType = typeof value == 'string' ? 'str' : 'num';
        createTr(platform, key, value, valueType, tbody, isItem);
      }
    }
  } else if (tbody == document.getElementById('transactionTbody')) {
    const transactionList = ['currency', 'value', 'transaction_id', 'shipping', 'tax', 'coupon', 'payment_type', 'shipping_tier', 'affiliation'];
    for (let key of transactionList) {
      if (data[key]) {
        const value = data[key];
        const valueType = typeof value == 'string' ? 'str' : 'num';
        createTr(platform, key, value, valueType, tbody, isItem);
      }
    }
  } else {
    for (const key in data) {
      const value = data[key];
      const valueType = typeof value === 'string' ? 'str' : 'num';
      if (!blockList.includes(key) || remainList.includes(key)) {
        createTr(platform, key, value, valueType, remainList.includes(key) ? document.getElementById('remainTbody') : tbody, isItem);
      }
    }
  }
}

function createTr(platform, key, value, valueType, tbody, isItem) {
  const isValid = isSearchValid(key, value, valueType);
  const hlClass = highLightValues.includes(key) ? 'hl' : '';
  let convertValue = key == 'error_code' ? errorMessage(value) : value;

  const rowHtml = `<tr class="${hlClass}">
    <td>${isItem}${key}</td>
    <td>${convertValue}</td>
    ${platform === 'ios' ? `<td><div class="${valueType}">${valueType}</div></td>` : '<td></td>'}
  </tr>`;

  tbody.insertAdjacentHTML('beforeend', rowHtml);

  if (!isValid) {
    tbody.lastChild.classList.add('error');
  }
}

// 매개변수 출력 초기화 함수
function clearTableContents() {
  const tableIds = ['epTbody', 'upTbody', 'transactionTbody', 'itemsTbody', 'remainTbody'];
  const imgIds = ['upImg', 'transImg', 'itemImg', 'remainImg'];

  tableIds.forEach((tableId) => {
    const tbody = document.getElementById(tableId);
    tbody.replaceChildren();
  });

  imgIds.forEach((imgId) => {
    const img = document.getElementById(imgId);
    img.className = '';
  });
}

// 이벤트 리스트 초기화 함수
function clearList() {
  const eventList = document.getElementById('eventList');
  const ul = document.querySelector('ul');
  eventArr = [];
  eventList.replaceChildren();
  eventList.insertAdjacentHTML('beforeend',`<div class="loadingField"><div class="loading2"></div><div class="loading"></div></div>`);
  ul.replaceChildren();
  ul.insertAdjacentHTML('beforeend',`<div class="noEvent"><div>Event not found...</div><div class="loader"></div></div>`);
  clearTableContents();
}

function changeLoading() {
  const targetDiv = document.querySelector(".loading2");
  targetDiv?.classList.add('change');
}

// 드롭다운 함수
function dropDown(thead) {
  const tbody = thead.parentElement.parentElement.nextElementSibling;
  const img = thead.children[0] ? thead.children[0] : thead.nextElementSibling.children[0];
  if (tbody.childElementCount > 0) {
    tbody.classList.toggle('sum');
  }
  img.classList.toggle('up');
}

function isSearchValid(key, value, type) {
  const intValueKeys = ['tax', 'shipping', 'value', 'quantity', 'price', 'discount', 'index'];
  const stringValueKeys = ['screen_name', 'screen_class', 'currency', 'transaction_id', 'coupon', 'payment_type', 'shipping_tier', 'affiliation'];

  switch (true) {
    case key.includes('item_') && type === 'num':
    case key.includes('dimension') && type === 'num':
    case key.includes('ep_') && type === 'num':
    case stringValueKeys.includes(key) && type === 'num':
    case key.includes('metric') && type === 'str':
    case key.includes('cm_') && type === 'str':
    case intValueKeys.includes(key) && type === 'str':
    case key.includes('error'):
    case type === 'str' && value.includes('Error:'):
      return false;
    default:
      return true;
  }
}

function copyData() {
  const tables = ['epTbody', 'upTbody', 'transactionTbody', 'itemsTbody', 'remainTbody'];
  const formattedText = tables
    .map((tableId) => {
      const table = document.getElementById(tableId);
      if (table && table.children.length > 0) {
        return formatTable(table);
      } else {
        return null;
      }
    })
    .filter((formatted) => formatted !== null)
    .join('\n\n');

  if (formattedText == '') {
    alert('복사할 데이터가 없습니다.');
    return false;
  }
  copyTextToClipboard(formattedText);
}

function formatTable(table) {
  return Array.from(table.rows)
    .map((row) =>
      Array.from(row.cells)
        .filter((_, index) => index !== 2)
        .map((cell) => cell.textContent)
        .join('\t')
    )
    .join('\n');
}

function copyTextToClipboard(text) {
  const textarea = document.createElement('textarea');
  const img = document.querySelector('.copyImg');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  img.classList.add('check');
}

function contactUs() {
  window.open('https://github.com/amazing86400/Project_WEB_DataInspector');
}

// 에러 메시지 정의 함수
function errorMessage(errorCode) {
  const convertError = {
    2: '이벤트 이름이 잘못되었습니다.',
    3: '이벤트 매개변수 이름이 잘못되었습니다.',
    4: '이벤트 매개변수 값이 너무 깁니다.',
    5: '이벤트 매개변수가 25개를 넘습니다.',
    6: '사용자 속성 이름이 잘못되었습니다.',
    7: '사용자 속성 값이 너무 깁니다.',
    8: '앱 인스턴스가 기록하는 고유 이벤트 유형이 500개를 넘습니다.',
    9: '앱 인스턴스가 설정하는 고유 사용자 속성이 25개를 넘습니다.',
    10: '앱 인스턴스의 전환 이벤트 일일 한도를 초과하였습니다.',
    11: '앱 인스턴스가 블랙리스트에 포함된 이벤트를 기록했습니다.',
    12: '앱 인스턴스가 블랙리스트에 포함된 사용자 속성을 설정했습니다.',
    13: '예약된 이벤트 이름입니다.',
    14: '예약된 매개변수 이름입니다.',
    15: '예약된 사용자 속성 이름입니다.',
    17: '매개변수 배열 길이가 한도(200)를 초과했습니다.',
    18: '값 매개변수 유형이 잘못되었습니다.',
    19: '전환 이벤트의 통화 매개변수가 누락되었습니다.',
    20: '이벤트 배열 매개변수 이름이 잘못되었습니다.',
    21: '이벤트가 배열 매개변수를 지원하지 않습니다.',
    22: '항목에 배열 기반 매개변수를 포함할 수 없습니다.',
    23: '항목에 맞춤 매개변수를 포함할 수 없습니다.',
    25: '항목 배열이 Google Play 서비스의 클라이언트 버전에서 지원되지 않습니다(Android만 해당).',
    28: '항목의 맞춤 매개변수가 27개를 초과합니다.',
  };
  const value = errorCode + ': ' + convertError[errorCode] || errorCode;

  return value;
}

// 페이지 새로고침시 alert창 출력해주는 함수
// window.onbeforeunload = function (e) {
//   let dialogText = 'Dialog text here';
//   e.returnValue = dialogText;
//   return dialogText;
// };