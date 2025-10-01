// 최종 데이터 Array
let eventArr = [];

function convertJsoniOS(bundle, platform) {
  const isIos = platform == 'iOS' ? 'ios' : 'android';
  // 이벤트 이름을 매핑하는 객체
  const convertKey = {
    // 이벤트명
    _s: "session_start",
    "session_start(_s)": "session_start",
    _e: "user_engagement",
    "user_engagement(_e)": "user_engagement",
    _vs: "screen_view",
    "screen_view(_vs)": "screen_view",
    _ab: "app_background",
    _au: "app_update",

    // 매개변수
    _si: "firebase_screen_id",
    "ga_screen_id(_si)": "firebase_screen_id",
    _sn: "firebase_screen_name",
    _sc: "firebase_screen_class",
    "ga_screen(_sn)": "firebase_screen_name",
    "ga_screen_class(_sc)": "firebase_screen_class",
    _et: "engagement_time_msec",
    _o: "firebase_event_origin",
    _pn: "previous_screen_name",
    _pc: "previous_view_controller",
    _err: "error_code",
    _ev: "error_parameter",
    _el: "error",
    _r: "realtime",
    _dbg: "ga_debug",
    _id: "user_id",

    _sid: "ga_session_id",
    _sno: "ga_session_number",
    "ga_event_origin(_o)": "firebase_event_origin"
  };

  const transactionKey = [
      "currency",
      "transaction_id",
      "value",
      "tax",
      "shipping",
      "affiliation",
      "coupon",
      "payment_type",
      "shipping_tier"
  ]
  // 값 변환 유틸
  const getValue = (obj) => {
    if ('int_value' in obj) return Number(obj.int_value);
    if ('string_value' in obj) return obj.string_value;
    if ('double_value' in obj) return obj.double_value;
    return "Error: 값이 없습니다.";
  };

  // key 변환 + 값 가져오기
  const setKeyValue = (target, key, obj) => {
    target[convertKey[key] || key] = getValue(obj);
  };

  bundle.forEach(bundleItem => {
    const { event: eventList, user_property: userProps, ...remainDatas } = bundleItem;

    eventList.forEach(ev => {
      const eventParams = {};

      ev.param.forEach(p => {
        if (p.name === 'items' && Array.isArray(p.value)) {
          eventParams.items = [];
          p.value.forEach(itemGroup => {
            if (Array.isArray(itemGroup.item)) {
              const itemObj = {};
              itemGroup.item.forEach(itemProp => setKeyValue(itemObj, itemProp.name, itemProp));
              eventParams.items.push(itemObj);
            }
          });
        } else if (transactionKey.includes(p.name)) {
          eventParams.transactions = eventParams.transactions || {};
          setKeyValue(eventParams.transactions, p.name, p);
        } else {
          if (['ga_screen_id(_si)'].includes(p.name)) {
            setKeyValue(eventParams, p.name, p);  
          }
          setKeyValue(eventParams, p.name, p);
        }

        eventParams.event_name = convertKey[ev.name] || ev.name;
      });

      const userProperties = {};
      userProps.forEach(up => {
        if (['_npa', '_sid', '_sno'].includes(up.name)) {
          remainDatas[convertKey[up.name]||up.name] = getValue(up);
        } else {
          setKeyValue(userProperties, up.name, up);
        }
      })
      
      const moveKeys = ['platform', 'device_model', 'app_id'];

      Object.keys(remainDatas).forEach(key => {
        if (moveKeys.includes(key)) {
          eventParams[key] = remainDatas[key];
          delete remainDatas[key];            
        }
      });

      eventArr.push({
        eventName: convertKey[ev.name] || ev.name,
        platform: isIos,
        eventParams,
        userProperties,
        remainDatas

      });
    });
  });
}
