(function () {
  var sms = document.getElementById("smsLink");
  if (!sms) return;

  var number = "+46730785744";
  var body =
    "Hi Katja,%0A%0AI'd like to commission a pet portrait.%0A• Pet type (breed):%0A• Preferred size:%0A• Style (classic or painterly):%0A• Deadline (if any):%0A• Links to photos:";

  // iOS uses &body, Android uses ?body
  var isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  sms.href = "sms:" + encodeURIComponent(number) + (isIOS ? "&body=" : "?body=") + body;
})();
